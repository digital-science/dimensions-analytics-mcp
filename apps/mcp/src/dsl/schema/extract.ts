/**
 * Normalizes raw `describe` API responses.
 * @module schema/extract
 */

import type { DescribeSchemaResponse, DescribeVersionResponse } from "./types.js";

/**
 * Extracts describe schema payload from a raw API response.
 * @param raw - Raw DSL API response
 * @returns Normalized describe schema object
 */
export function extractDescribeSchema(raw: unknown): DescribeSchemaResponse {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("Invalid describe schema response: expected object");
  }
  const record = raw as Record<string, unknown>;
  if ("sources" in record || "entities" in record) {
    return {
      sources: (record.sources as DescribeSchemaResponse["sources"]) ?? {},
      entities: (record.entities as DescribeSchemaResponse["entities"]) ?? {},
    };
  }
  throw new Error("Invalid describe schema response: missing sources/entities");
}

/**
 * Extracts version string from `describe version` response.
 * @param raw - Raw DSL API response
 * @returns Version string or undefined
 */
export function extractDescribeVersion(raw: unknown): string | undefined {
  if (typeof raw !== "object" || raw === null) {
    return undefined;
  }
  const record = raw as DescribeVersionResponse & Record<string, unknown>;
  if (typeof record.version === "string") {
    return record.version;
  }
  if (typeof record.release === "string") {
    return record.release;
  }
  return undefined;
}
