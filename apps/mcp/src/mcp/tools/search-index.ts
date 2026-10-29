/**
 * Optional search index (`search <entity> in <index> for "..."`) for search_* and analytics tools.
 * @module mcp/tools/search-index
 */

import { z } from "zod";
import type { QueryBuilder } from "../../dsl/index.js";
import { ValidationError } from "../../dsl/index.js";

/** `searchIn` input shared by search_* and analytics tools (WEBAPPDEV-14092). */
export const SEARCH_IN_INPUT = {
  searchIn: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Search index for `query`. Omit to search full text (full_data). Use title_abstract_only when " +
        "ranking or counting work that is about a topic — full text also matches records that only " +
        "mention the terms in passing. Other common values: title_only, full_data_exact (full text " +
        "without stemming). Valid indexes differ by entity; see searchIndexes in " +
        "dimensions://fields/{entityType}. Requires `query`.",
    ),
} as const;

/**
 * Restricts the builder's search terms to `searchIn` when set.
 * Call before the first API request so invalid input never reaches the API.
 * @param builder - Query builder with the entity already set
 * @param args - Tool arguments with optional query and searchIn
 * @throws {ValidationError} When searchIn is set without a query, or is not an index of the entity
 */
export function applySearchIn(
  builder: QueryBuilder,
  args: { query?: unknown; searchIn?: unknown },
): void {
  if (typeof args.searchIn !== "string" || args.searchIn.length === 0) {
    return;
  }
  if (typeof args.query !== "string" || args.query.length === 0) {
    throw new ValidationError(
      `searchIn "${args.searchIn}" requires a query: the index only restricts where the query terms match`,
    );
  }
  builder.in(args.searchIn);
}
