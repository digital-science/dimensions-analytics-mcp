/**
 * Shared Zod input schemas for structured search and batch fetch tools.
 * @module mcp/tools/search-input
 */

import { z } from "zod";
import { ExtendedWhereFilterSchema, SCHEMA_LIMITS } from "../../dsl/index.js";

/** Pagination parameters shared by search_* and fetch_search_pages. */
export const PAGINATION_INPUT_SCHEMA = {
  skip: z
    .number()
    .int()
    .min(0)
    .max(SCHEMA_LIMITS.maxOffset - 1)
    .optional()
    .describe(
      `Records to skip (0-based). Mutually exclusive with page. Max window: ${SCHEMA_LIMITS.maxOffset} total records.`,
    ),
  page: z
    .number()
    .int()
    .min(0)
    .max(SCHEMA_LIMITS.maxPages - 1)
    .optional()
    .describe(
      `Page index (0-based). Equivalent to skip = page × limit. Max page ${SCHEMA_LIMITS.maxPages - 1}.`,
    ),
} as const;

/** Core search parameters shared by search_* tools. */
export const SHARED_SEARCH_INPUT = {
  query: z
    .string()
    .describe("Search query terms (omit with filters-only search if the API allows)"),
  limit: z
    .number()
    .int()
    .min(1)
    .max(SCHEMA_LIMITS.maxLimit)
    .default(100)
    .describe(`Maximum results to return (max ${SCHEMA_LIMITS.maxLimit}, default 100)`),
  ...PAGINATION_INPUT_SCHEMA,
  fields: z
    .array(z.string())
    .optional()
    .describe(
      "Fields to return. Accepts aliases or DSL names. Use dimensions://fields/{entity} for the full list.",
    ),
  filters: z
    .array(ExtendedWhereFilterSchema)
    .optional()
    .describe("Additional where-clause filters"),
  confirmLargeFetch: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      "Required when skip≥5000, page≥5, or limit=1000 with skip>0. Acknowledges Dimensions reasonable-use policy (dimensions://schema/policy).",
    ),
} as const;

/** Output schema fields for paginated search responses. */
export const PAGINATION_OUTPUT_SCHEMA = {
  pagination: z
    .object({
      pageSize: z.number(),
      skip: z.number(),
      page: z.number(),
      nextSkip: z.number().nullable(),
      maxPageSize: z.number(),
      maxTotalRecords: z.number(),
      maxPagesRemaining: z.number(),
      estimatedRequestsToFetchAll: z.number(),
      estimatedMinutesToFetchAll: z.number(),
    })
    .optional()
    .describe("Pagination metadata when results span multiple pages"),
  largeResultWarning: z
    .string()
    .optional()
    .describe("Soft warning when totalCount exceeds 10,000 — narrow filters first"),
  policyNotice: z
    .string()
    .optional()
    .describe("Reasonable-use reminder when results are truncated or very large"),
} as const;
