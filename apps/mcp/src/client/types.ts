/**
 * Core type definitions for the Dimensions API infrastructure layer.
 *
 * DSL vocabulary types (operators, entities, search indexes) live in
 * `@digital-science/dimensions-dsl` (`types/vocabulary`) — import from there.
 *
 * @module types
 */

/**
 * Typed response from a Dimensions DSL query.
 * Contains entity arrays keyed by entity type (e.g., `publications`, `grants`)
 * and optional statistics metadata.
 */
export interface DslResponse {
  /** Query statistics including total result count */
  readonly _stats?: { readonly total_count: number };
  /** Entity results and other response fields */
  [key: string]: unknown;
}

/**
 * Options for individual query execution.
 */
export interface QueryExecutorOptions {
  /** AbortSignal for cancellation */
  readonly signal?: AbortSignal;
  /** Request timeout override in milliseconds */
  readonly timeout?: number;
}

/**
 * Interface for executing raw DSL queries.
 * Used to decouple FluentQueryBuilder from the concrete DimensionsClient.
 */
export interface QueryExecutor {
  /**
   * Executes a raw DSL query against the Dimensions API.
   * @param dsl - The DSL query string to execute
   * @param options - Optional signal and timeout overrides
   * @returns The parsed API response with entity data and stats
   */
  rawQuery(dsl: string, options?: QueryExecutorOptions): Promise<DslResponse>;
}
