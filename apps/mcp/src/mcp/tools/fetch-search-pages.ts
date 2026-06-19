/**
 * Multi-page search fetch tool for Dimensions DSL queries.
 * Supports single-page, aggregate, and JSONL file export modes.
 * @module mcp/tools/fetch-search-pages
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ValidationError } from "../../client/index.js";
import {
  DEFAULT_BATCH_MAX_PAGES,
  type DimensionsClient,
  HARD_MAX_BATCH_PAGES,
  parseEntityResponse,
  resolveSkipAndLimit,
  SCHEMA_LIMITS,
  type SchemaStore,
  STRUCTURED_ENTITY_TYPES,
  type StructuredEntityType,
  searchResultKey,
  validateBatchPagination,
  validateSearchPaginationPolicy,
} from "../../dsl/index.js";
import { queryHashFromDsl, runAggregateFetch, runFileFetch } from "../batch-fetch.js";
import { resolveExportFormat } from "../export-format.js";
import { withFieldAliases } from "../middleware/field-aliases.js";
import {
  formatErrorResult,
  formatToolResult,
  READ_ONLY_API_ANNOTATIONS,
  withSearchPagination,
} from "../utils.js";
import { buildStructuredSearchDsl } from "./search.js";
import { SEARCH_ENTITY_METADATA } from "./search-entity-metadata.js";
import { PAGINATION_OUTPUT_SCHEMA, SHARED_SEARCH_INPUT } from "./search-input.js";

/** Merged optional convenience filters from all entity search tools. */
const MERGED_ENTITY_INPUT = Object.assign(
  {},
  ...SEARCH_ENTITY_METADATA.map((m) => m.extraInputSchema),
);

/** Shared search fields without `limit` — fetch uses `pageSize` to avoid Zod default conflicts. */
const { limit: _searchLimit, ...FETCH_SEARCH_INPUT } = SHARED_SEARCH_INPUT;

const FETCH_MODE_SCHEMA = z
  .enum(["page", "aggregate", "file"])
  .default("page")
  .describe(
    "page: return one page in the tool response; aggregate: fetch multiple pages and return summary only; file: stream JSONL or CSV to outputPath (not returned in chat)",
  );

/** Parsed input for fetch_search_pages (after MCP SDK validation). */
type FetchSearchPagesArgs = {
  entityType: StructuredEntityType;
  mode?: "page" | "aggregate" | "file";
  query?: string;
  skip?: number;
  page?: number;
  pageSize?: number;
  startPage?: number;
  maxPages?: number;
  maxRecords?: number;
  outputPath?: string;
  outputFormat?: "jsonl" | "csv";
  resumeFromMeta?: boolean;
  confirmLargeFetch?: boolean;
  fields?: string[];
  filters?: unknown[];
  sortBy?: string;
  [key: string]: unknown;
};

/**
 * Registers the fetch_search_pages tool.
 * @param server - MCP server instance
 * @param client - Dimensions client instance
 * @param schemaStore - Loaded describe schema
 */
export function registerFetchSearchPagesTools(
  server: McpServer,
  client: DimensionsClient,
  schemaStore: SchemaStore,
): void {
  const entityList = schemaStore.structuredEntityTypes().join(", ");

  server.registerTool(
    "fetch_search_pages",
    {
      description:
        `Fetch paginated search results with rate-limit-aware batching (max ${SCHEMA_LIMITS.maxLimit}/page, ` +
        `${SCHEMA_LIMITS.maxPages} pages, ${SCHEMA_LIMITS.maxOffset} records total). ` +
        "Default mode returns one page. Use aggregate for ID counts/sums without full rows. " +
        "Use file mode to stream JSONL or CSV locally — never for bulk mirroring of Dimensions data. " +
        `Entities: ${entityList}.`,
      inputSchema: {
        entityType: z
          .enum(STRUCTURED_ENTITY_TYPES)
          .describe("Dimensions source to search (same as search_* tools)"),
        mode: FETCH_MODE_SCHEMA,
        ...FETCH_SEARCH_INPUT,
        ...MERGED_ENTITY_INPUT,
        pageSize: z
          .number()
          .int()
          .min(1)
          .max(SCHEMA_LIMITS.maxLimit)
          .optional()
          .describe(
            `Records per page (page mode default 100, aggregate/file default 1000; max ${SCHEMA_LIMITS.maxLimit})`,
          ),
        startPage: z
          .number()
          .int()
          .min(0)
          .max(SCHEMA_LIMITS.maxPages - 1)
          .optional()
          .describe("Starting page for aggregate/file modes (0-based, default 0)"),
        maxPages: z
          .number()
          .int()
          .min(1)
          .max(HARD_MAX_BATCH_PAGES)
          .default(DEFAULT_BATCH_MAX_PAGES)
          .describe(
            `Pages to fetch in aggregate/file modes (default ${DEFAULT_BATCH_MAX_PAGES}, max ${HARD_MAX_BATCH_PAGES}). Ignored in page mode.`,
          ),
        maxRecords: z
          .number()
          .int()
          .min(1)
          .max(SCHEMA_LIMITS.maxOffset)
          .optional()
          .describe("Stop after this many records across pages"),
        outputPath: z
          .string()
          .optional()
          .describe("Required for file mode — local output path (.jsonl or .csv)"),
        outputFormat: z
          .enum(["jsonl", "csv"])
          .optional()
          .describe(
            "File format for file mode (default: infer from outputPath extension, else JSONL)",
          ),
        resumeFromMeta: z
          .boolean()
          .optional()
          .default(false)
          .describe("Resume file export from existing outputPath.meta.json sidecar"),
        confirmLargeFetch: z
          .boolean()
          .optional()
          .default(false)
          .describe(
            "Required when maxPages > 5 or planned records > 5000. Acknowledges reasonable-use policy.",
          ),
      },
      outputSchema: {
        mode: z.string(),
        entityType: z.string(),
        totalCount: z.number().optional(),
        returnedCount: z.number().optional(),
        pagesFetched: z.number().optional(),
        ...PAGINATION_OUTPUT_SCHEMA,
        outputPath: z.string().optional(),
        outputFormat: z.string().optional(),
        metaPath: z.string().optional(),
        recordsWritten: z.number().optional(),
        resumed: z.boolean().optional(),
        aggregate: z
          .object({
            ids: z.array(z.string()),
            idsTruncated: z.boolean(),
            totalFundingUsd: z.number().optional(),
          })
          .optional(),
      },
      annotations: READ_ONLY_API_ANNOTATIONS,
    },
    withFieldAliases(
      {
        entitySource: { kind: "dynamic", argName: "entityType" },
        fieldArrayArgs: ["fields"],
        fieldStringArgs: ["sortBy"],
        filterArrayArgs: ["filters"],
      },
      async (args: FetchSearchPagesArgs) => {
        try {
          const entityType = args.entityType;
          const mode = args.mode ?? "page";
          const pageSize = args.pageSize ?? (mode === "page" ? 100 : 1000);
          const startPage = args.page ?? args.startPage ?? 0;
          const maxPages = mode === "page" ? 1 : (args.maxPages ?? DEFAULT_BATCH_MAX_PAGES);

          validateBatchPagination({
            startPage,
            maxPages,
            pageSize,
            maxRecords: args.maxRecords,
            confirmLargeFetch: args.confirmLargeFetch,
          });

          if (mode === "page") {
            const pageSkip =
              args.skip !== undefined || args.page !== undefined
                ? resolveSkipAndLimit({
                    skip: args.skip,
                    page: args.page,
                    limit: pageSize,
                  }).skip
                : startPage * pageSize;
            validateSearchPaginationPolicy({
              skip: pageSkip,
              limit: pageSize,
              confirmLargeFetch: args.confirmLargeFetch,
            });
          }

          const buildDsl = (skip: number, limit: number) =>
            buildStructuredSearchDsl(client, entityType, {
              ...args,
              skip,
              limit,
              pageSize: limit,
            });

          if (mode === "file") {
            if (!args.outputPath) {
              return formatErrorResult(
                new ValidationError("outputPath is required for file mode", { mode: "file" }),
              );
            }
            const outputFormat = resolveExportFormat(args.outputPath, args.outputFormat);
            const sampleDsl = buildDsl(startPage * pageSize, pageSize);
            const hash = queryHashFromDsl(sampleDsl);
            const fileResult = await runFileFetch(client, entityType, buildDsl, args.outputPath, {
              startPage,
              maxPages,
              pageSize,
              maxRecords: args.maxRecords,
              queryHash: hash,
              format: outputFormat,
              preferredFields: args.fields,
              resumeFromMeta: args.resumeFromMeta,
            });
            return formatToolResult({
              mode: "file",
              entityType,
              totalCount: fileResult.totalCount,
              pagesFetched: fileResult.pagesFetched,
              recordsWritten: fileResult.recordsWritten,
              outputPath: fileResult.outputPath,
              outputFormat: fileResult.format,
              metaPath: fileResult.metaPath,
              resumed: fileResult.resumed,
              largeResultWarning:
                fileResult.totalCount > 10_000
                  ? `${fileResult.totalCount} total matches — export may require many requests at ${SCHEMA_LIMITS.requestsPerMinute}/min.`
                  : undefined,
            });
          }

          if (mode === "aggregate") {
            const summary = await runAggregateFetch(client, entityType, buildDsl, {
              startPage,
              maxPages,
              pageSize,
              maxRecords: args.maxRecords,
            });
            return formatToolResult({
              mode: "aggregate",
              entityType,
              totalCount: summary.totalCount,
              returnedCount: summary.recordsFetched,
              pagesFetched: summary.pagesFetched,
              aggregate: {
                ids: summary.ids,
                idsTruncated: summary.idsTruncated,
                ...(summary.totalFundingUsd !== undefined
                  ? { totalFundingUsd: summary.totalFundingUsd }
                  : {}),
              },
              truncated: summary.totalCount > summary.recordsFetched,
              truncationWarning:
                summary.totalCount > summary.recordsFetched
                  ? `Fetched ${summary.recordsFetched} of ${summary.totalCount} records across ${summary.pagesFetched} page(s). Increase maxPages or use file mode for full export.`
                  : undefined,
            });
          }

          // mode === "page"
          const { skip, limit } = resolveSkipAndLimit(
            args.skip !== undefined || args.page !== undefined
              ? {
                  skip: args.skip,
                  page: args.page,
                  limit: pageSize,
                }
              : { skip: startPage * pageSize, limit: pageSize },
          );
          const dsl = buildDsl(skip, limit);
          const response = (await client.rawQuery(dsl)) as Record<string, unknown>;
          const parsed = parseEntityResponse(response, entityType);
          const rows = parsed.data as Record<string, unknown>[];
          const resultKey = searchResultKey(entityType);

          return formatToolResult(
            withSearchPagination(
              {
                mode: "page",
                entityType,
                totalCount: parsed.totalCount,
                returnedCount: rows.length,
                pagesFetched: 1,
                [resultKey]: rows,
              },
              parsed.totalCount,
              rows.length,
              skip,
              limit,
            ),
          );
        } catch (error) {
          return formatErrorResult(error);
        }
      },
    ),
  );
}
