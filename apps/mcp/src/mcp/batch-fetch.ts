/**
 * Multi-page search fetch helpers (aggregate and file export).
 * @module mcp/batch-fetch
 */

import { createHash } from "node:crypto";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { DimensionsClient } from "../dsl/index.js";
import {
  AGGREGATE_ID_CAP,
  parseEntityResponse,
  SCHEMA_LIMITS,
  type StructuredEntityType,
} from "../dsl/index.js";
import { type ExportFormat, formatRowsForExport } from "./export-format.js";

/** Sidecar metadata written beside export files. */
export interface BatchExportMeta {
  readonly queryHash: string;
  readonly entityType: StructuredEntityType;
  readonly format: ExportFormat;
  readonly columns?: readonly string[];
  readonly lastSkip: number;
  readonly pagesDone: number;
  readonly recordsWritten: number;
  readonly totalCount: number;
  readonly pageSize: number;
  readonly updatedAt: string;
}

/** Summary returned from aggregate multi-page fetch. */
export interface AggregateFetchSummary {
  readonly pagesFetched: number;
  readonly recordsFetched: number;
  readonly totalCount: number;
  readonly ids: string[];
  readonly idsTruncated: boolean;
  readonly totalFundingUsd?: number;
}

/**
 * Computes a short hash of the search definition (excluding skip/limit).
 * @param dsl - Full DSL query string
 * @returns 16-character hex hash prefix
 */
export function queryHashFromDsl(dsl: string): string {
  const normalized = dsl.replace(/\bskip \d+\b/g, "").replace(/\blimit \d+\b/g, "limit");
  return createHash("sha256").update(normalized).digest("hex").slice(0, 16);
}

/**
 * Reads export sidecar metadata if present.
 * @param metaPath - Path to `.meta.json` sidecar
 * @returns Parsed metadata or undefined
 */
export async function readExportMeta(metaPath: string): Promise<BatchExportMeta | undefined> {
  try {
    const raw = await readFile(metaPath, "utf8");
    return JSON.parse(raw) as BatchExportMeta;
  } catch {
    return undefined;
  }
}

/**
 * Writes export sidecar metadata.
 * @param metaPath - Path to `.meta.json` sidecar
 * @param meta - Metadata to persist
 */
export async function writeExportMeta(metaPath: string, meta: BatchExportMeta): Promise<void> {
  await mkdir(dirname(metaPath), { recursive: true });
  await writeFile(metaPath, JSON.stringify(meta, null, 2), "utf8");
}

/**
 * Fetches multiple pages and returns an aggregate summary (no full row payloads).
 * @param client - Dimensions client
 * @param entityType - Entity source name
 * @param buildDsl - Factory for DSL given skip and page size
 * @param options - Batch parameters
 * @returns Aggregate summary
 */
export async function runAggregateFetch(
  client: DimensionsClient,
  entityType: StructuredEntityType,
  buildDsl: (skip: number, limit: number) => string,
  options: {
    startPage: number;
    maxPages: number;
    pageSize: number;
    maxRecords?: number;
  },
): Promise<AggregateFetchSummary> {
  const ids: string[] = [];
  let recordsFetched = 0;
  let pagesFetched = 0;
  let totalCount = 0;
  let totalFundingUsd = 0;
  let hasFunding = false;

  for (let p = options.startPage; p < options.startPage + options.maxPages; p++) {
    const skip = p * options.pageSize;
    if (skip + options.pageSize > SCHEMA_LIMITS.maxOffset) break;

    const dsl = buildDsl(skip, options.pageSize);
    const response = (await client.rawQuery(dsl)) as Record<string, unknown>;
    const parsed = parseEntityResponse(response, entityType);
    if (pagesFetched === 0) {
      totalCount = parsed.totalCount;
    }

    for (const row of parsed.data as Record<string, unknown>[]) {
      if (typeof row.id === "string" && ids.length < AGGREGATE_ID_CAP) {
        ids.push(row.id);
      }
      if (entityType === "grants" && typeof row.funding_usd === "number") {
        totalFundingUsd += row.funding_usd;
        hasFunding = true;
      }
      recordsFetched++;
      if (options.maxRecords !== undefined && recordsFetched >= options.maxRecords) {
        break;
      }
    }

    pagesFetched++;
    if (parsed.data.length < options.pageSize) break;
    if (options.maxRecords !== undefined && recordsFetched >= options.maxRecords) break;
  }

  return {
    pagesFetched,
    recordsFetched,
    totalCount,
    ids,
    idsTruncated: recordsFetched > ids.length,
    ...(hasFunding ? { totalFundingUsd } : {}),
  };
}

/**
 * Streams multiple pages to a JSONL or CSV file with resume metadata.
 * @param client - Dimensions client
 * @param entityType - Entity source name
 * @param buildDsl - Factory for DSL given skip and page size
 * @param outputPath - Destination file path
 * @param options - Batch, format, and resume parameters
 * @returns Export result summary
 */
export async function runFileFetch(
  client: DimensionsClient,
  entityType: StructuredEntityType,
  buildDsl: (skip: number, limit: number) => string,
  outputPath: string,
  options: {
    startPage: number;
    maxPages: number;
    pageSize: number;
    maxRecords?: number;
    queryHash: string;
    format: ExportFormat;
    preferredFields?: readonly string[];
    resumeFromMeta?: boolean;
  },
): Promise<{
  outputPath: string;
  metaPath: string;
  format: ExportFormat;
  recordsWritten: number;
  pagesFetched: number;
  totalCount: number;
  resumed: boolean;
}> {
  const metaPath = `${outputPath}.meta.json`;
  let startPage = options.startPage;
  let recordsWritten = 0;
  let resumed = false;
  let csvColumns: string[] | undefined;

  if (options.resumeFromMeta) {
    const existing = await readExportMeta(metaPath);
    if (
      existing?.queryHash === options.queryHash &&
      existing.entityType === entityType &&
      existing.format === options.format
    ) {
      startPage = Math.floor(existing.lastSkip / options.pageSize) + 1;
      recordsWritten = existing.recordsWritten;
      csvColumns = existing.columns ? [...existing.columns] : undefined;
      resumed = true;
    }
  }

  await mkdir(dirname(outputPath), { recursive: true });

  let pagesFetched = 0;
  let totalCount = 0;

  for (let p = startPage; p < startPage + options.maxPages; p++) {
    const skip = p * options.pageSize;
    if (skip + options.pageSize > SCHEMA_LIMITS.maxOffset) break;

    const dsl = buildDsl(skip, options.pageSize);
    const response = (await client.rawQuery(dsl)) as Record<string, unknown>;
    const parsed = parseEntityResponse(response, entityType);
    if (pagesFetched === 0 && !resumed) {
      totalCount = parsed.totalCount;
    } else if (totalCount === 0) {
      totalCount = parsed.totalCount;
    }

    const rows = parsed.data as Record<string, unknown>[];
    const { text, columns } = formatRowsForExport(rows, options.format, {
      columns: csvColumns,
      preferredFields: options.preferredFields,
      includeHeader: options.format === "csv" && recordsWritten === 0 && rows.length > 0,
    });
    if (options.format === "csv" && columns.length > 0) {
      csvColumns = columns;
    }
    if (text.length > 0) {
      await appendFile(outputPath, text, "utf8");
    }

    recordsWritten += rows.length;
    pagesFetched++;

    await writeExportMeta(metaPath, {
      queryHash: options.queryHash,
      entityType,
      format: options.format,
      ...(csvColumns?.length ? { columns: csvColumns } : {}),
      lastSkip: skip,
      pagesDone: p + 1,
      recordsWritten,
      totalCount,
      pageSize: options.pageSize,
      updatedAt: new Date().toISOString(),
    });

    if (rows.length < options.pageSize) break;
    if (options.maxRecords !== undefined && recordsWritten >= options.maxRecords) break;
  }

  return {
    outputPath,
    metaPath,
    format: options.format,
    recordsWritten,
    pagesFetched,
    totalCount,
    resumed,
  };
}
