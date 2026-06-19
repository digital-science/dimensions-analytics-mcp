/**
 * Discriminated union types for DSL return clauses.
 * Supports entity returns, simple facets, and aggregated facets.
 * @module types/return-clauses
 */

import type { SortOrder } from "./vocabulary.js";

/**
 * Entity return clause.
 * DSL: return publications[id+title]
 */
export interface EntityReturnClause {
  readonly type: "entity";
  readonly fields?: readonly string[];
  readonly limit?: number;
  readonly skip?: number;
  readonly sortField?: string;
  readonly sortOrder?: SortOrder;
}

/**
 * Simple facet return clause (no aggregations).
 * DSL: return year limit 100
 */
export interface FacetReturnClause<F extends string = string> {
  readonly type: "facet";
  readonly field: F;
  readonly limit?: number;
}

/**
 * Aggregated facet return clause with indicators and sorting.
 * DSL: return funders aggregate rcr_avg, altmetric_median sort by rcr_avg desc limit 10
 */
export interface AggregatedFacetReturnClause<F extends string = string, I extends string = string> {
  readonly type: "aggregated_facet";
  readonly field: F;
  readonly indicators: readonly I[];
  readonly sortBy?: I | "count";
  readonly sortOrder?: SortOrder;
  readonly limit?: number;
}

/**
 * Union of all return clause types.
 * @template F - The facet field type
 * @template I - The indicator type
 */
export type ReturnClause<F extends string = string, I extends string = string> =
  | EntityReturnClause
  | FacetReturnClause<F>
  | AggregatedFacetReturnClause<F, I>;

/**
 * Type for facet clauses only (excludes entity return).
 * @template F - The facet field type
 * @template I - The indicator type
 */
export type FacetClause<F extends string = string, I extends string = string> =
  | FacetReturnClause<F>
  | AggregatedFacetReturnClause<F, I>;

// #region Time-Series Return Types

/**
 * Supported currencies for funding_per_year function.
 */
export const SUPPORTED_CURRENCIES = [
  "AUD",
  "CAD",
  "CHF",
  "CNY",
  "EUR",
  "GBP",
  "JPY",
  "NZD",
  "USD",
] as const;

/**
 * Currency type for funding operations.
 */
export type Currency = (typeof SUPPORTED_CURRENCIES)[number];

/**
 * Time-series return clause types.
 */
export type TimeSeriesFunction = "citations_per_year" | "funding_per_year";

/**
 * Time-series return clause for citations_per_year or funding_per_year.
 * DSL: return citations_per_year(2010, 2023)
 * DSL: return funding_per_year(2015, 2023, "USD")
 */
export interface TimeSeriesReturnClause {
  readonly type: "time_series";
  readonly function: TimeSeriesFunction;
  readonly startYear: number;
  readonly endYear: number;
  /** Currency for funding_per_year (required for funding, ignored for citations) */
  readonly currency?: Currency;
}

/**
 * A single time-series data point.
 */
export interface TimeSeriesDataPoint {
  readonly year: number;
  readonly value: number;
}

/**
 * Result structure for time-series functions.
 */
export interface TimeSeriesResult {
  readonly data: readonly TimeSeriesDataPoint[];
}

// #endregion

// #region Unnest Types

/**
 * Unnest field specification for flattening nested data.
 * DSL: unnest(researchers)
 */
export interface UnnestField {
  readonly type: "unnest";
  readonly field: string;
}

// #endregion

// #region Grouped Return Types

/**
 * Grouped return clause for organizing results into named groups.
 * DSL: return in "docs" publications[id + title]
 */
export interface GroupedReturnClause {
  readonly type: "grouped";
  readonly groupName: string;
  readonly entityOrFacet: EntityReturnClause | FacetReturnClause | AggregatedFacetReturnClause;
}

// #endregion
