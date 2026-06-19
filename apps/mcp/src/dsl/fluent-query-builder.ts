/**
 * Fluent query builder that wraps QueryBuilder with execute() capability.
 * Provides a chainable API for building and executing Dimensions DSL queries.
 * @module fluent-query-builder
 */

import type { QueryExecutor } from "../client/index.js";
import { QueryBuilder } from "./query-builder.js";
import {
  type FacetFieldConfig,
  type FacetQueryResult,
  type ParseFacetOptions,
  parseEntityResponse,
  parseFacetResponse,
  type TypedFacetResult,
} from "./response-parser.js";
import type { SchemaStore } from "./schema/store.js";
import type { BaseBucket } from "./types/buckets.js";
import type {
  ClinicalTrial,
  Dataset,
  Grant,
  Organization,
  Patent,
  PolicyDocument,
  Publication,
  Researcher,
} from "./types/entities.js";
import type { Currency } from "./types/return-clauses.js";
import type { EntityType, SearchIndex, SortOrder, WhereOperator } from "./types/vocabulary.js";

/**
 * Maps entity types to their corresponding TypeScript interfaces.
 */
export type EntityTypeMap = {
  publications: Publication;
  grants: Grant;
  researchers: Researcher;
  patents: Patent;
  clinical_trials: ClinicalTrial;
  datasets: Dataset;
  policy_documents: PolicyDocument;
  organizations: Organization;
};

/**
 * Result of executing a fluent query.
 * @template T - The entity type
 */
export interface FluentQueryResult<T> {
  /** Array of matching entities */
  readonly data: T[];
  /** Total count of matching entities (may be larger than data.length if paginated) */
  readonly totalCount: number;
}

/**
 * Internal state for tracking facet configurations.
 */
interface FacetConfig {
  readonly field: string;
  readonly indicators?: readonly string[];
  readonly sortBy?: string;
  readonly sortOrder?: SortOrder;
  readonly limit?: number;
}

/** Facet results keyed by configured facet field name. */
type FacetResults<TFacets extends Record<string, FacetConfig>> = {
  [K in keyof TFacets & string]: TypedFacetResult<BaseBucket>;
};

/**
 * Abstract base class for fluent query builders.
 * Contains all common query-building methods shared between FluentQueryBuilder
 * and FluentQueryBuilderWithFacets.
 *
 * @template T - The entity type
 * @template E - The entity type key
 */
abstract class FluentQueryBuilderBase<T, E extends EntityType> {
  protected readonly executor: QueryExecutor;
  protected readonly entity: E;
  protected readonly queryBuilder: QueryBuilder;

  /**
   * Creates a new FluentQueryBuilderBase instance.
   * @param executor - The query executor to use for executing queries
   * @param entity - The entity type to search
   * @param queryBuilder - The underlying query builder instance
   */
  constructor(executor: QueryExecutor, entity: E, queryBuilder: QueryBuilder) {
    this.executor = executor;
    this.entity = entity;
    this.queryBuilder = queryBuilder;
  }

  /**
   * Sets the search index for full-text search.
   * @param index - The search index to use
   * @returns This builder for chaining
   */
  in(index: SearchIndex): this {
    this.queryBuilder.in(index);
    return this;
  }

  /**
   * Sets the search terms.
   * @param terms - Search terms to look for
   * @returns This builder for chaining
   */
  for(terms: string): this {
    this.queryBuilder.for(terms);
    return this;
  }

  /**
   * Sets the search to find semantically similar documents.
   * Uses the similar_documents() DSL function.
   * Available for publications and grants.
   * @param text - Abstract or description text to find similar documents for
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * const result = await client
   *   .publications()
   *   .forSimilar("After spinal cord injury, macrophages infiltrate...")
   *   .where("year", ">", 2015)
   *   .limit(10)
   *   .execute();
   * ```
   */
  forSimilar(text: string): this {
    this.queryBuilder.forSimilar(text);
    return this;
  }

  /**
   * Sets the search to use proximity matching via the complex() DSL function.
   * Finds documents where search terms appear within a maximum distance of each other.
   * @param phrase - The search phrase
   * @param maxDist - Maximum distance between terms (must be >= 1)
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * const result = await client
   *   .publications()
   *   .forComplex("quantum networking", 3)
   *   .where("year", ">", 2020)
   *   .limit(10)
   *   .execute();
   * ```
   */
  forComplex(phrase: string, maxDist: number): this {
    this.queryBuilder.forComplex(phrase, maxDist);
    return this;
  }

  /**
   * Sets the search to use minimum term matching via the min_should_match() DSL function.
   * Finds documents matching at least `min` of the terms in the phrase.
   * @param phrase - The search phrase
   * @param min - Minimum number of terms that must match (must be >= 1)
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * const result = await client
   *   .publications()
   *   .forMinShouldMatch("quantum OR optical networking", 2)
   *   .where("year", ">", 2020)
   *   .limit(10)
   *   .execute();
   * ```
   */
  forMinShouldMatch(phrase: string, min: number): this {
    this.queryBuilder.forMinShouldMatch(phrase, min);
    return this;
  }

  /**
   * Adds a where clause condition.
   * @param field - Field name to filter on
   * @param operator - Comparison operator
   * @param value - Value to compare against
   * @returns This builder for chaining
   */
  where(field: string, operator: WhereOperator, value: string | number | boolean): this {
    this.queryBuilder.where(field, operator, value);
    return this;
  }

  /**
   * Adds a condition checking if a field is empty.
   * @param field - Field name to check
   * @returns This builder for chaining
   */
  whereEmpty(field: string): this {
    this.queryBuilder.whereEmpty(field);
    return this;
  }

  /**
   * Adds a condition checking if a field is not empty.
   * @param field - Field name to check
   * @returns This builder for chaining
   */
  whereNotEmpty(field: string): this {
    this.queryBuilder.whereNotEmpty(field);
    return this;
  }

  /**
   * Adds a list filter condition (field in ["a", "b", "c"]).
   * @param field - Field name to filter on
   * @param values - Array of values to match
   * @returns This builder for chaining
   */
  whereIn(field: string, values: readonly (string | number)[]): this {
    this.queryBuilder.whereIn(field, values);
    return this;
  }

  /**
   * Adds a range filter condition (field in [start:end]).
   * @param field - Field name to filter on
   * @param start - Start of range (inclusive)
   * @param end - End of range (inclusive)
   * @returns This builder for chaining
   */
  whereRange(field: string, start: string | number, end: string | number): this {
    this.queryBuilder.whereRange(field, start, end);
    return this;
  }

  /**
   * Adds a count filter condition (count(field) op value).
   * @param field - Multi-value field name to count
   * @param operator - Comparison operator
   * @param value - Count to compare against
   * @returns This builder for chaining
   */
  whereCount(field: string, operator: "=" | "!=" | ">" | "<" | ">=" | "<=", value: number): this {
    this.queryBuilder.whereCount(field, operator, value);
    return this;
  }

  /**
   * Sets the next connector to OR.
   * @returns This builder for chaining
   */
  or(): this {
    this.queryBuilder.or();
    return this;
  }

  /**
   * Sets the next connector to NOT.
   * @returns This builder for chaining
   */
  not(): this {
    this.queryBuilder.not();
    return this;
  }

  /**
   * Sets the next connector to AND explicitly.
   * @returns This builder for chaining
   */
  and(): this {
    this.queryBuilder.and();
    return this;
  }

  /**
   * Opens a parenthesized group.
   * @returns This builder for chaining
   */
  openGroup(): this {
    this.queryBuilder.openGroup();
    return this;
  }

  /**
   * Closes a parenthesized group.
   * @returns This builder for chaining
   */
  closeGroup(): this {
    this.queryBuilder.closeGroup();
    return this;
  }

  /**
   * Sets the fields to return.
   * When T is a known entity type, provides autocomplete for field names.
   * Also accepts string[] for nested fields like "authors.name".
   * @param fieldList - Array of field names to return
   * @returns This builder for chaining
   */
  fields(fieldList: (keyof T | string)[]): this {
    this.queryBuilder.fields(fieldList as string[]);
    return this;
  }

  /**
   * Sets the sort field and order.
   * @param field - Field name to sort by
   * @param order - Sort direction (asc or desc)
   * @returns This builder for chaining
   */
  sort(field: string, order: SortOrder = "asc"): this {
    this.queryBuilder.sort(field, order);
    return this;
  }

  /**
   * Sets the number of results to skip (for pagination).
   * @param count - Number of results to skip
   * @returns This builder for chaining
   */
  skip(count: number): this {
    this.queryBuilder.skip(count);
    return this;
  }

  /**
   * Sets the maximum number of results to return.
   * @param count - Maximum number of results
   * @returns This builder for chaining
   */
  limit(count: number): this {
    this.queryBuilder.limit(count);
    return this;
  }

  /**
   * Gets the built DSL query string without executing.
   * Useful for debugging or logging.
   * @returns The DSL query string
   */
  getDsl(): string {
    return this.queryBuilder.build();
  }

  /**
   * Adds a citations_per_year time-series return clause.
   * Returns citation counts per year for the specified range.
   *
   * @param startYear - Start year for the time series (inclusive)
   * @param endYear - End year for the time series (inclusive)
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * const result = await client
   *   .publications()
   *   .for("machine learning")
   *   .returnCitationsPerYear(2010, 2023)
   *   .execute();
   * ```
   */
  returnCitationsPerYear(startYear: number, endYear: number): this {
    this.queryBuilder.returnCitationsPerYear(startYear, endYear);
    return this;
  }

  /**
   * Adds a funding_per_year time-series return clause.
   * Returns funding amounts per year for the specified range.
   *
   * @param startYear - Start year for the time series (inclusive)
   * @param endYear - End year for the time series (inclusive)
   * @param currency - Currency for the funding amounts (default: "USD")
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * const result = await client
   *   .grants()
   *   .for("cancer research")
   *   .returnFundingPerYear(2015, 2023, "EUR")
   *   .execute();
   * ```
   */
  returnFundingPerYear(startYear: number, endYear: number, currency: Currency = "USD"): this {
    this.queryBuilder.returnFundingPerYear(startYear, endYear, currency);
    return this;
  }

  /**
   * Sets the fields to return including unnest operations.
   * Unnest flattens nested arrays into separate rows (Cartesian product).
   *
   * @param fieldList - Array of regular field names to return
   * @param unnestFieldList - Array of field names to unnest
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * const result = await client
   *   .publications()
   *   .for("machine learning")
   *   .fieldsWithUnnest(["id", "title"], ["researchers", "category_for"])
   *   .execute();
   * // Returns flattened rows - one row per researcher × category combination
   * ```
   */
  fieldsWithUnnest(
    fieldList: readonly (keyof T | string)[],
    unnestFieldList: readonly string[],
  ): this {
    this.queryBuilder.fieldsWithUnnest(fieldList as string[], unnestFieldList);
    return this;
  }

  /**
   * Adds an unnest field to the return clause.
   * Can be chained with fields() to add unnest operations.
   *
   * @param field - Field name to unnest
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * const result = await client
   *   .publications()
   *   .for("test")
   *   .fields(["id", "title"])
   *   .unnest("researchers")
   *   .unnest("category_for")
   *   .execute();
   * ```
   */
  unnest(field: string): this {
    this.queryBuilder.addUnnest(field);
    return this;
  }

  /**
   * Builds and executes the query against the Dimensions API.
   * @returns The query result with data and totalCount
   * @throws {ValidationError} If response structure is invalid
   */
  async execute(): Promise<FluentQueryResult<T>> {
    const dsl = this.queryBuilder.build();
    const response = await this.executor.rawQuery(dsl);

    const entityResult = parseEntityResponse<T>(response, this.entity);

    return {
      data: entityResult.data as T[],
      totalCount: entityResult.totalCount,
    };
  }
}

/**
 * Fluent query builder with facet support.
 * Extends FluentQueryBuilderBase to add type-safe facet methods.
 *
 * @template T - The entity type
 * @template E - The entity type key
 * @template TFacets - Record of tracked facet configurations
 */
export class FluentQueryBuilderWithFacets<
  T,
  E extends EntityType,
  TFacets extends Record<string, FacetConfig> = Record<string, never>,
> extends FluentQueryBuilderBase<T, E> {
  protected readonly facetConfigs: TFacets;

  constructor(
    executor: QueryExecutor,
    entity: E,
    queryBuilder: QueryBuilder,
    facetConfigs: TFacets = {} as TFacets,
  ) {
    super(executor, entity, queryBuilder);
    this.facetConfigs = facetConfigs;
  }

  /**
   * Adds a simple facet return clause.
   * Only allows valid facet fields for this entity type.
   *
   * **Important:** This method returns a **new** builder instance. You must use the
   * returned builder for subsequent chaining — calling `withFacet()` on the original
   * builder and discarding the result will silently lose the facet configuration.
   *
   * @param field - The facet field
   * @param options - Optional limit for facet results
   * @returns A new builder with tracked facet configuration (must be used for further chaining)
   */
  withFacet(
    field: string,
    options?: { limit?: number },
  ): FluentQueryBuilderWithFacets<T, E, TFacets & Record<string, FacetConfig>> {
    const cloned = this.queryBuilder.clone();
    cloned.returnFacet(field, options);
    const newConfig: FacetConfig = {
      field,
      limit: options?.limit,
    };
    return new FluentQueryBuilderWithFacets(this.executor, this.entity, cloned, {
      ...this.facetConfigs,
      [field]: newConfig,
    } as TFacets & Record<string, FacetConfig>);
  }

  /**
   * Adds an aggregated facet return clause.
   * Only allows valid facet fields and indicators for this entity type.
   *
   * **Important:** This method returns a **new** builder instance. You must use the
   * returned builder for subsequent chaining — calling `withAggregate()` on the original
   * builder and discarding the result will silently lose the aggregation configuration.
   *
   * @param field - The facet field
   * @param indicators - Array of indicator names to aggregate
   * @param options - Optional sort and limit options
   * @returns A new builder with tracked facet configuration (must be used for further chaining)
   */
  withAggregate(
    field: string,
    indicators: readonly string[],
    options?: {
      sortBy?: string;
      sortOrder?: SortOrder;
      limit?: number;
    },
  ): FluentQueryBuilderWithFacets<T, E, TFacets & Record<string, FacetConfig>> {
    const cloned = this.queryBuilder.clone();
    cloned.returnAggregate(field, [...indicators], options);
    const newConfig: FacetConfig = {
      field,
      indicators,
      sortBy: options?.sortBy,
      sortOrder: options?.sortOrder,
      limit: options?.limit,
    };
    return new FluentQueryBuilderWithFacets(this.executor, this.entity, cloned, {
      ...this.facetConfigs,
      [field]: newConfig,
    } as TFacets & Record<string, FacetConfig>);
  }

  /**
   * Executes query and returns result with typed facets.
   * Returns facets as a record with TypedFacetResult for each configured facet.
   * Bucket types are inferred from the entity type and facet configuration.
   * @param options - Optional configuration for parsing the response
   * @returns Result with entities and typed facet results
   */
  async executeWithFacets(
    options?: ParseFacetOptions,
  ): Promise<FacetQueryResult<T, FacetResults<TFacets>>> {
    const dsl = this.queryBuilder.build();
    const response = await this.executor.rawQuery(dsl);

    // Build facet field configs with indicators for validation
    const facetFieldConfigs: Record<string, FacetFieldConfig> = {};
    for (const [field, config] of Object.entries(this.facetConfigs)) {
      facetFieldConfigs[field] = {
        indicators: config.indicators,
      };
    }

    return parseFacetResponse(
      response,
      this.entity,
      facetFieldConfigs,
      options,
    ) as FacetQueryResult<T, FacetResults<TFacets>>;
  }
}

/**
 * Fluent query builder that wraps QueryBuilder with execute() capability.
 * Provides a chainable API for building and executing Dimensions DSL queries.
 *
 * @template T - The entity type
 * @template E - The entity type key (defaults to EntityType)
 *
 * @example
 * ```typescript
 * // Use via DimensionsClient entity methods
 * const result = await client
 *   .publications()
 *   .for("machine learning")
 *   .where("year", ">=", 2020)
 *   .fields(["id", "title", "doi"])
 *   .sort("times_cited", "desc")
 *   .limit(100)
 *   .execute();
 *
 * console.log(`Found ${result.totalCount} publications`);
 * for (const pub of result.data) {
 *   console.log(pub.title);
 * }
 * ```
 */
export class FluentQueryBuilder<
  T,
  E extends EntityType = EntityType,
> extends FluentQueryBuilderBase<T, E> {
  /**
   * Creates a new FluentQueryBuilder instance.
   * @param executor - The query executor to use for executing queries
   * @param entity - The entity type to search
   */
  constructor(executor: QueryExecutor, entity: E, schemaStore?: SchemaStore) {
    const queryBuilder = new QueryBuilder(schemaStore).search(entity);
    super(executor, entity, queryBuilder);
  }

  /**
   * Adds a simple facet return clause.
   * Transitions to FluentQueryBuilderWithFacets for facet execution.
   *
   * **Important:** This method returns a **new** builder instance. You must use the
   * returned builder for subsequent chaining — calling `withFacet()` on the original
   * builder and discarding the result will silently lose the facet configuration.
   *
   * @param field - The facet field
   * @param options - Optional limit for facet results
   * @returns A new builder with facet support (must be used for further chaining)
   */
  withFacet(
    field: string,
    options?: { limit?: number },
  ): FluentQueryBuilderWithFacets<T, E, Record<string, FacetConfig>> {
    const cloned = this.queryBuilder.clone();
    cloned.returnFacet(field, options);
    const config: FacetConfig = {
      field,
      limit: options?.limit,
    };
    return new FluentQueryBuilderWithFacets(this.executor, this.entity, cloned, {
      [field]: config,
    });
  }

  /**
   * Adds an aggregated facet return clause.
   * Transitions to FluentQueryBuilderWithFacets for facet execution.
   *
   * **Important:** This method returns a **new** builder instance. You must use the
   * returned builder for subsequent chaining — calling `withAggregate()` on the original
   * builder and discarding the result will silently lose the aggregation configuration.
   *
   * @param field - The facet field
   * @param indicators - Array of indicator names to aggregate
   * @param options - Optional sort and limit options
   * @returns A new builder with facet support (must be used for further chaining)
   */
  withAggregate(
    field: string,
    indicators: readonly string[],
    options?: {
      sortBy?: string;
      sortOrder?: SortOrder;
      limit?: number;
    },
  ): FluentQueryBuilderWithFacets<T, E, Record<string, FacetConfig>> {
    const cloned = this.queryBuilder.clone();
    cloned.returnAggregate(field, [...indicators], options);
    const config: FacetConfig = {
      field,
      indicators,
      sortBy: options?.sortBy,
      sortOrder: options?.sortOrder,
      limit: options?.limit,
    };
    return new FluentQueryBuilderWithFacets(this.executor, this.entity, cloned, {
      [field]: config,
    });
  }
}

// Re-export types for convenience
export type { FacetQueryResult, TypedFacetResult } from "./response-parser.js";
