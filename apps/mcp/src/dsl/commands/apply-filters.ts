/**
 * Shared helper for applying extended where filters to a QueryBuilder.
 * @module commands/apply-filters
 */

import type { QueryBuilder } from "../query-builder.js";
import type { ExtendedWhereFilterInput } from "./facet/schemas.js";

/**
 * Applies an array of extended where filters to a QueryBuilder instance.
 * Dispatches to the appropriate QueryBuilder method based on the filter operator.
 *
 * @param builder - QueryBuilder instance to apply filters to
 * @param filters - Array of extended where filters
 */
export function applyFilters(
  builder: QueryBuilder,
  filters: readonly ExtendedWhereFilterInput[],
): void {
  for (const f of filters) {
    switch (f.operator) {
      case "is_empty":
        builder.whereEmpty(f.field);
        break;
      case "is_not_empty":
        builder.whereNotEmpty(f.field);
        break;
      case "in":
        builder.whereIn(f.field, f.value);
        break;
      default:
        builder.where(f.field, f.operator, f.value);
    }
  }
}
