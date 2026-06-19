/**
 * Shared filter helpers for analytics tools (facet_query, aggregate_query).
 * @module mcp/tools/analytics-filters
 */

import type { EntityType, QueryBuilder } from "../../dsl/index.js";
import { applyFilters, type ExtendedWhereFilterInput } from "../../dsl/index.js";

/** Primary year field per entity for convenience yearFrom/yearTo filters. */
const ENTITY_YEAR_FIELD: Partial<Record<EntityType, string>> = {
  publications: "year",
  grants: "start_year",
  patents: "year",
  clinical_trials: "year",
  datasets: "year",
  policy_documents: "year",
};

/**
 * Applies year range and extended where filters to an analytics query builder.
 * @param builder - Query builder for the target entity
 * @param entityType - Entity being analyzed
 * @param args - Tool arguments with optional yearFrom, yearTo, filters
 */
export function applyAnalyticsFilters(
  builder: QueryBuilder,
  entityType: EntityType,
  args: {
    yearFrom?: number;
    yearTo?: number;
    filters?: readonly ExtendedWhereFilterInput[];
  },
): void {
  const yearField = ENTITY_YEAR_FIELD[entityType];
  if (yearField) {
    if (typeof args.yearFrom === "number") {
      builder.where(yearField, ">=", args.yearFrom);
    }
    if (typeof args.yearTo === "number") {
      builder.where(yearField, "<=", args.yearTo);
    }
  }
  if (args.filters?.length) {
    applyFilters(builder, args.filters);
  }
}
