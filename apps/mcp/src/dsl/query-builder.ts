/**
 * Query builder for constructing Dimensions DSL queries programmatically.
 * @module query-builder
 */

import { ValidationError } from "../client/index.js";
import type { SchemaStore } from "./schema/store.js";
import { assertValidEntity, assertValidSearchIndex } from "./schema/validation.js";
import type {
  AggregatedFacetReturnClause,
  Currency,
  FacetClause,
  FacetReturnClause,
  GroupedReturnClause,
  TimeSeriesReturnClause,
} from "./types/return-clauses.js";
import type { EntityType, SearchIndex, SortOrder, WhereOperator } from "./types/vocabulary.js";
import { VALID_OPERATORS } from "./types/vocabulary.js";
import { escapeDslString } from "./utils/escape.js";
import { MAX_SEARCH_TEXT_LENGTH, sanitizeInput } from "./utils/sanitize.js";
import { validateFieldName } from "./utils/validate-field-name.js";

// Re-export types for backwards compatibility
export type { EntityType, SearchIndex, SortOrder, WhereOperator };

/**
 * Boolean connector between conditions.
 */
type BooleanConnector = "and" | "or" | "not";

/**
 * Represents a node in the boolean expression tree.
 */
type ExpressionNode =
  | { readonly type: "condition"; readonly condition: string }
  | { readonly type: "connector"; readonly connector: BooleanConnector }
  | { readonly type: "group_start" }
  | { readonly type: "group_end" };

/**
 * Fluent builder for constructing Dimensions DSL queries.
 * Provides a type-safe way to build search queries with conditions, sorting, and pagination.
 *
 * @example
 * ```typescript
 * const query = new QueryBuilder()
 *   .search("publications")
 *   .for("machine learning")
 *   .where("year", ">=", 2020)
 *   .fields(["id", "title", "doi"])
 *   .sort("times_cited", "desc")
 *   .limit(100)
 *   .build();
 * ```
 */
export class QueryBuilder {
  private readonly schemaStore: SchemaStore | undefined;
  private entity: string | null = null;
  private searchIndex: string | null = null;
  private searchTerms: string | null = null;
  private similarText: string | null = null;
  private complexPhrase: string | null = null;
  private complexMaxDist: number | null = null;
  private minShouldMatchPhrase: string | null = null;
  private minShouldMatchMin: number | null = null;
  private expressionNodes: ExpressionNode[] = [];
  private groupDepth: number = 0;
  private pendingConnector: BooleanConnector | null = null;
  private returnFields: string[] = [];
  private unnestFields: string[] = [];
  private sortField: string | null = null;
  private sortOrder: SortOrder = "asc";
  private skipValue: number | null = null;
  private limitValue: number | null = null;
  private facetClauses: FacetClause[] = [];
  private timeSeriesClauses: TimeSeriesReturnClause[] = [];
  private groupedClauses: GroupedReturnClause[] = [];

  /**
   * @param schemaStore - Optional describe schema for entity/index validation
   */
  constructor(schemaStore?: SchemaStore) {
    this.schemaStore = schemaStore;
  }

  /**
   * Adds a condition node to the expression tree.
   * Handles automatic AND connector insertion.
   * @param condition - The condition string to add
   */
  private addConditionNode(condition: string): void {
    // Add pending connector if exists
    if (this.pendingConnector) {
      this.expressionNodes.push({
        type: "connector",
        connector: this.pendingConnector,
      });
      this.pendingConnector = null;
    } else if (this.expressionNodes.length > 0) {
      // Default to AND if no connector specified
      const lastNode = this.expressionNodes[this.expressionNodes.length - 1];
      if (lastNode?.type === "condition" || lastNode?.type === "group_end") {
        this.expressionNodes.push({ type: "connector", connector: "and" });
      }
    }
    this.expressionNodes.push({ type: "condition", condition });
  }

  /**
   * Determines if a space should be added before an expression node.
   * Handles spacing rules for parentheses in boolean expressions.
   * @param node - The current expression node
   * @param prevNode - The previous expression node (or null if first)
   * @returns True if a space should be added before the node
   */
  private shouldAddSpaceBefore(node: ExpressionNode, prevNode: ExpressionNode | null): boolean {
    if (prevNode === null) return false;
    if (prevNode.type === "group_start") return false;
    if (node.type === "group_end") return false;
    return true;
  }

  /**
   * Sets the entity type to search.
   * @param entity - The entity type to search (publications, grants, etc.)
   * @returns This builder for chaining
   * @throws {ValidationError} If entity type is invalid
   */
  search(entity: EntityType | string): this {
    assertValidEntity(this.schemaStore, entity);
    this.entity = entity;
    return this;
  }

  /**
   * Sets the search index for full-text search.
   * Requires search terms via {@link for} — building without search terms will throw.
   * @param index - The search index to use
   * @returns This builder for chaining
   * @throws {ValidationError} If index is invalid
   * @throws {ValidationError} If used without search terms at build time
   */
  in(index: SearchIndex | string): this {
    assertValidSearchIndex(this.schemaStore, this.entity, index);
    this.searchIndex = index;
    return this;
  }

  /**
   * Sets the search terms for full-text search.
   *
   * **Note:** `"*"` is **not** a wildcard in the Dimensions DSL — it is treated as a literal
   * string. To search all records without a text filter, simply omit the `for()` call and
   * use `where()` conditions instead.
   *
   * @param terms - Search terms to look for
   * @returns This builder for chaining
   */
  for(terms: string): this {
    const sanitized = sanitizeInput(terms);
    if (sanitized.length > MAX_SEARCH_TEXT_LENGTH) {
      throw new ValidationError(
        `Search text exceeds maximum length of ${MAX_SEARCH_TEXT_LENGTH} characters`,
      );
    }
    this.searchTerms = sanitized;
    return this;
  }

  /**
   * Sets the search to find semantically similar documents based on text.
   * Uses the similar_documents() DSL function.
   * @param text - The text (abstract, description) to find similar documents for
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * const query = new QueryBuilder()
   *   .search("publications")
   *   .forSimilar("After spinal cord injury, macrophages infiltrate...")
   *   .where("year", ">", 2015)
   *   .limit(10)
   *   .build();
   * // Generates: search publications for similar_documents("...") where year > 2015 ...
   * ```
   */
  forSimilar(text: string): this {
    const sanitized = sanitizeInput(text);
    if (sanitized.length > MAX_SEARCH_TEXT_LENGTH) {
      throw new ValidationError(
        `Search text exceeds maximum length of ${MAX_SEARCH_TEXT_LENGTH} characters`,
      );
    }
    this.similarText = sanitized;
    return this;
  }

  /**
   * Sets the search to use proximity matching via the complex() DSL function.
   * Finds documents where search terms appear within a maximum distance of each other.
   * @param phrase - The search phrase
   * @param maxDist - Maximum distance between terms (must be >= 1)
   * @returns This builder for chaining
   * @throws {ValidationError} If maxDist is less than 1
   *
   * @example
   * ```typescript
   * const query = new QueryBuilder()
   *   .search("publications")
   *   .forComplex("quantum networking", 3)
   *   .build();
   * // Generates: search publications for complex("quantum networking", 3)
   * ```
   */
  forComplex(phrase: string, maxDist: number): this {
    if (maxDist < 1) {
      throw new ValidationError("maxDist must be >= 1");
    }
    const sanitized = sanitizeInput(phrase);
    if (sanitized.length > MAX_SEARCH_TEXT_LENGTH) {
      throw new ValidationError(
        `Search text exceeds maximum length of ${MAX_SEARCH_TEXT_LENGTH} characters`,
      );
    }
    this.complexPhrase = sanitized;
    this.complexMaxDist = maxDist;
    return this;
  }

  /**
   * Sets the search to use minimum term matching via the min_should_match() DSL function.
   * Finds documents matching at least `min` of the terms in the phrase.
   * @param phrase - The search phrase
   * @param min - Minimum number of terms that must match (must be >= 1)
   * @returns This builder for chaining
   * @throws {ValidationError} If min is less than 1
   *
   * @example
   * ```typescript
   * const query = new QueryBuilder()
   *   .search("publications")
   *   .forMinShouldMatch("quantum OR optical networking", 2)
   *   .build();
   * // Generates: search publications for min_should_match("quantum OR optical networking", 2)
   * ```
   */
  forMinShouldMatch(phrase: string, min: number): this {
    if (min < 1) {
      throw new ValidationError("min must be >= 1");
    }
    const sanitized = sanitizeInput(phrase);
    if (sanitized.length > MAX_SEARCH_TEXT_LENGTH) {
      throw new ValidationError(
        `Search text exceeds maximum length of ${MAX_SEARCH_TEXT_LENGTH} characters`,
      );
    }
    this.minShouldMatchPhrase = sanitized;
    this.minShouldMatchMin = min;
    return this;
  }

  /**
   * Adds a where clause condition.
   * @param field - Field name to filter on
   * @param operator - Comparison operator
   * @param value - Value to compare against
   * @returns This builder for chaining
   * @throws {ValidationError} If operator is invalid
   */
  where(field: string, operator: WhereOperator, value: string | number | boolean): this {
    validateFieldName(field);
    if (!VALID_OPERATORS.includes(operator)) {
      throw new ValidationError(`Invalid operator: ${operator}`);
    }
    const formattedValue = typeof value === "string" ? `"${escapeDslString(value)}"` : value;
    this.addConditionNode(`${field} ${operator} ${formattedValue}`);
    return this;
  }

  /**
   * Adds a condition checking if a field is empty.
   * @param field - Field name to check
   * @returns This builder for chaining
   */
  whereEmpty(field: string): this {
    validateFieldName(field);
    this.addConditionNode(`${field} is empty`);
    return this;
  }

  /**
   * Adds a condition checking if a field is not empty.
   * @param field - Field name to check
   * @returns This builder for chaining
   */
  whereNotEmpty(field: string): this {
    validateFieldName(field);
    this.addConditionNode(`${field} is not empty`);
    return this;
  }

  /**
   * Adds a list filter condition (field in ["a", "b", "c"]).
   * @param field - Field name to filter on
   * @param values - Array of values to match
   * @returns This builder for chaining
   * @throws {ValidationError} If values array is empty
   * @throws {ValidationError} If values array exceeds 400 items (DSL limit)
   */
  whereIn(field: string, values: readonly (string | number)[]): this {
    validateFieldName(field);
    if (values.length === 0) {
      throw new ValidationError("List filter must have at least one value");
    }
    if (values.length > 400) {
      throw new ValidationError("List filter cannot exceed 400 items");
    }
    const formattedValues = values
      .map((v) => (typeof v === "string" ? `"${escapeDslString(v)}"` : v))
      .join(", ");
    this.addConditionNode(`${field} in [${formattedValues}]`);
    return this;
  }

  /**
   * Adds a range filter condition (field in [start:end]).
   * @param field - Field name to filter on
   * @param start - Start of range (inclusive)
   * @param end - End of range (inclusive)
   * @returns This builder for chaining
   * @throws {ValidationError} If numeric start is greater than numeric end
   */
  whereRange(field: string, start: string | number, end: string | number): this {
    validateFieldName(field);
    if (typeof start === "number" && typeof end === "number" && start > end) {
      throw new ValidationError("Range start must not be greater than end");
    }
    const formattedStart = typeof start === "string" ? `"${escapeDslString(start)}"` : start;
    const formattedEnd = typeof end === "string" ? `"${escapeDslString(end)}"` : end;
    this.addConditionNode(`${field} in [${formattedStart}:${formattedEnd}]`);
    return this;
  }

  /**
   * Sets the next connector to OR.
   * @returns This builder for chaining
   */
  or(): this {
    this.pendingConnector = "or";
    return this;
  }

  /**
   * Sets the next connector to NOT.
   * @returns This builder for chaining
   */
  not(): this {
    this.pendingConnector = "not";
    return this;
  }

  /**
   * Sets the next connector to AND explicitly.
   * Note: AND is the default connector between conditions, but this method
   * provides API symmetry with or() and not().
   * @returns This builder for chaining
   */
  and(): this {
    this.pendingConnector = "and";
    return this;
  }

  /**
   * Opens a parenthesized group.
   * @returns This builder for chaining
   */
  openGroup(): this {
    // Add pending connector if exists
    if (this.pendingConnector) {
      this.expressionNodes.push({
        type: "connector",
        connector: this.pendingConnector,
      });
      this.pendingConnector = null;
    } else if (this.expressionNodes.length > 0) {
      const lastNode = this.expressionNodes[this.expressionNodes.length - 1];
      if (lastNode?.type === "condition" || lastNode?.type === "group_end") {
        this.expressionNodes.push({ type: "connector", connector: "and" });
      }
    }
    this.expressionNodes.push({ type: "group_start" });
    this.groupDepth++;
    return this;
  }

  /**
   * Closes a parenthesized group.
   * @returns This builder for chaining
   * @throws {ValidationError} If no group is open
   */
  closeGroup(): this {
    if (this.groupDepth === 0) {
      throw new ValidationError("No group to close");
    }
    this.expressionNodes.push({ type: "group_end" });
    this.groupDepth--;
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
    validateFieldName(field);
    this.addConditionNode(`count(${field}) ${operator} ${value}`);
    return this;
  }

  /**
   * Sets the fields to return.
   * @param fieldList - Array of field names to return
   * @returns This builder for chaining
   */
  fields(fieldList: string[]): this {
    for (const field of fieldList) {
      validateFieldName(field);
    }
    this.returnFields = [...fieldList];
    return this;
  }

  /**
   * Sets the fields to return including unnest operations.
   * Unnest flattens nested arrays into separate rows (Cartesian product).
   * DSL: return publications[id+title+unnest(researchers)+unnest(category_for)]
   *
   * @param fieldList - Array of regular field names to return
   * @param unnestFieldList - Array of field names to unnest
   * @returns This builder for chaining
   * @throws {ValidationError} If any unnest field name is empty or whitespace-only
   *
   * @example
   * ```typescript
   * const query = new QueryBuilder()
   *   .search("publications")
   *   .for("machine learning")
   *   .fieldsWithUnnest(["id", "title"], ["researchers", "category_for"])
   *   .build();
   * // Returns flattened rows - one row per researcher × category combination
   * ```
   */
  fieldsWithUnnest(fieldList: readonly string[], unnestFieldList: readonly string[]): this {
    for (const field of fieldList) {
      validateFieldName(field);
    }
    for (const field of unnestFieldList) {
      validateFieldName(field);
    }
    this.returnFields = [...fieldList];
    this.unnestFields = [...unnestFieldList];
    return this;
  }

  /**
   * Adds an unnest field to the return clause.
   * Can be chained with fields() to add unnest operations.
   * DSL: return publications[id+title+unnest(researchers)]
   *
   * @param field - Field name to unnest
   * @returns This builder for chaining
   * @throws {ValidationError} If field name is empty or whitespace-only
   *
   * @example
   * ```typescript
   * const query = new QueryBuilder()
   *   .search("publications")
   *   .for("test")
   *   .fields(["id", "title"])
   *   .addUnnest("researchers")
   *   .addUnnest("category_for")
   *   .build();
   * ```
   */
  addUnnest(field: string): this {
    validateFieldName(field);
    this.unnestFields.push(field);
    return this;
  }

  /**
   * Sets the sort field and order.
   * @param field - Field name to sort by
   * @param order - Sort direction (asc or desc)
   * @returns This builder for chaining
   */
  sort(field: string, order: SortOrder = "asc"): this {
    validateFieldName(field);
    this.sortField = field;
    this.sortOrder = order;
    return this;
  }

  /**
   * Sets the number of results to skip (for pagination).
   * @param count - Number of results to skip
   * @returns This builder for chaining
   * @throws {ValidationError} If count is negative
   */
  skip(count: number): this {
    if (count < 0) {
      throw new ValidationError("Skip must be non-negative");
    }
    this.skipValue = count;
    return this;
  }

  /**
   * Sets the maximum number of results to return.
   * @param count - Maximum number of results
   * @returns This builder for chaining
   * @throws {ValidationError} If count is negative
   */
  limit(count: number): this {
    if (count < 0) {
      throw new ValidationError("Limit must be non-negative");
    }
    this.limitValue = count;
    return this;
  }

  /**
   * Adds a facet return clause.
   * DSL: return <field> [limit <n>]
   * @param field - Facet field name
   * @param options - Optional limit for facet results
   * @returns This builder for chaining
   * @throws {ValidationError} If field is empty or whitespace-only
   * @throws {ValidationError} If limit is negative
   */
  returnFacet(field: string, options?: { limit?: number }): this {
    validateFieldName(field);
    if (options?.limit !== undefined && options.limit < 0) {
      throw new ValidationError("Facet limit must be non-negative", {
        limit: options.limit,
      });
    }
    const clause: FacetReturnClause = {
      type: "facet",
      field,
      limit: options?.limit,
    };
    this.facetClauses.push(clause);
    return this;
  }

  /**
   * Adds an aggregated facet return clause.
   * DSL: return <field> aggregate <indicators> [sort by <indicator> <order>] [limit <n>]
   * @param field - Facet field name
   * @param indicators - Array of indicator names to aggregate
   * @param options - Optional sort and limit options
   * @returns This builder for chaining
   * @throws {ValidationError} If field is empty or whitespace-only
   * @throws {ValidationError} If indicators array is empty
   * @throws {ValidationError} If any indicator is empty or whitespace-only
   * @throws {ValidationError} If limit is negative
   * @throws {ValidationError} If sortBy is not one of indicators or "count"
   */
  returnAggregate(
    field: string,
    indicators: readonly string[],
    options?: {
      sortBy?: string;
      sortOrder?: SortOrder;
      limit?: number;
    },
  ): this {
    validateFieldName(field);
    if (indicators.length === 0) {
      throw new ValidationError("Aggregate must have at least one indicator", {
        field,
      });
    }
    for (const indicator of indicators) {
      if (!indicator || indicator.trim().length === 0) {
        throw new ValidationError("Indicator names must be non-empty strings", {
          field,
          indicator,
        });
      }
    }
    if (options?.limit !== undefined && options.limit < 0) {
      throw new ValidationError("Facet limit must be non-negative", {
        field,
        limit: options.limit,
      });
    }
    if (options?.sortBy) {
      const validSortTargets = [...indicators, "count"];
      if (!validSortTargets.includes(options.sortBy)) {
        throw new ValidationError(
          `sortBy must be one of [${validSortTargets.join(", ")}], got "${options.sortBy}"`,
          { field, sortBy: options.sortBy, validSortTargets },
        );
      }
    }
    const clause: AggregatedFacetReturnClause = {
      type: "aggregated_facet",
      field,
      indicators,
      sortBy: options?.sortBy,
      sortOrder: options?.sortOrder ?? "desc",
      limit: options?.limit,
    };
    this.facetClauses.push(clause);
    return this;
  }

  /**
   * Adds a citations_per_year time-series return clause.
   * Returns citation counts per year for the specified range.
   * DSL: return citations_per_year(2010, 2023)
   *
   * @param startYear - Start year for the time series (inclusive)
   * @param endYear - End year for the time series (inclusive)
   * @returns This builder for chaining
   * @throws {ValidationError} If startYear is greater than endYear
   *
   * @example
   * ```typescript
   * const query = new QueryBuilder()
   *   .search("publications")
   *   .for("machine learning")
   *   .returnCitationsPerYear(2010, 2023)
   *   .build();
   * // "search publications for ... return citations_per_year(2010, 2023)"
   * ```
   */
  returnCitationsPerYear(startYear: number, endYear: number): this {
    if (startYear > endYear) {
      throw new ValidationError("startYear must not be greater than endYear", {
        startYear,
        endYear,
      });
    }
    this.timeSeriesClauses.push({
      type: "time_series",
      function: "citations_per_year",
      startYear,
      endYear,
    });
    return this;
  }

  /**
   * Adds a funding_per_year time-series return clause.
   * Returns funding amounts per year for the specified range.
   * DSL: return funding_per_year(2015, 2023, "USD")
   *
   * @param startYear - Start year for the time series (inclusive)
   * @param endYear - End year for the time series (inclusive)
   * @param currency - Currency for the funding amounts (default: "USD")
   * @returns This builder for chaining
   * @throws {ValidationError} If startYear is greater than endYear
   *
   * @example
   * ```typescript
   * const query = new QueryBuilder()
   *   .search("grants")
   *   .for("cancer research")
   *   .returnFundingPerYear(2015, 2023, "EUR")
   *   .build();
   * // "search grants for ... return funding_per_year(2015, 2023, "EUR")"
   * ```
   */
  returnFundingPerYear(startYear: number, endYear: number, currency: Currency = "USD"): this {
    if (startYear > endYear) {
      throw new ValidationError("startYear must not be greater than endYear", {
        startYear,
        endYear,
      });
    }
    this.timeSeriesClauses.push({
      type: "time_series",
      function: "funding_per_year",
      startYear,
      endYear,
      currency,
    });
    return this;
  }

  /**
   * Adds a grouped entity return clause.
   * DSL: return in "docs" publications[id + title]
   *
   * @param groupName - Name for the result group
   * @param options - Entity return options (fields, limit, skip, sort)
   * @returns This builder for chaining
   * @throws {ValidationError} If groupName is empty or whitespace-only
   *
   * @example
   * ```typescript
   * const query = new QueryBuilder()
   *   .search("publications")
   *   .for("test")
   *   .returnGrouped("docs", { fields: ["id", "title"], limit: 10 })
   *   .build();
   * // "... return in "docs" publications[id+title] limit 10"
   * ```
   */
  returnGrouped(
    groupName: string,
    options?: {
      fields?: readonly string[];
      limit?: number;
      skip?: number;
      sortField?: string;
      sortOrder?: SortOrder;
    },
  ): this {
    if (!groupName || groupName.trim().length === 0) {
      throw new ValidationError("Group name must be non-empty", { groupName });
    }
    if (options?.fields) {
      for (const field of options.fields) {
        validateFieldName(field);
      }
    }
    if (options?.sortField) {
      validateFieldName(options.sortField);
    }
    this.groupedClauses.push({
      type: "grouped",
      groupName,
      entityOrFacet: {
        type: "entity",
        fields: options?.fields,
        limit: options?.limit,
        skip: options?.skip,
        sortField: options?.sortField,
        sortOrder: options?.sortOrder,
      },
    });
    return this;
  }

  /**
   * Adds a grouped facet return clause (simple facet).
   * DSL: return in "facets" year limit 10
   *
   * @param groupName - Name for the result group
   * @param field - Facet field name
   * @param options - Optional limit for facet results
   * @returns This builder for chaining
   * @throws {ValidationError} If groupName or field is empty
   *
   * @example
   * ```typescript
   * const query = new QueryBuilder()
   *   .search("publications")
   *   .for("test")
   *   .returnGroupedFacet("years", "year", { limit: 20 })
   *   .build();
   * // "... return in "years" year limit 20"
   * ```
   */
  returnGroupedFacet(groupName: string, field: string, options?: { limit?: number }): this {
    if (!groupName || groupName.trim().length === 0) {
      throw new ValidationError("Group name must be non-empty", { groupName });
    }
    validateFieldName(field);
    this.groupedClauses.push({
      type: "grouped",
      groupName,
      entityOrFacet: {
        type: "facet",
        field,
        limit: options?.limit,
      },
    });
    return this;
  }

  /**
   * Adds a grouped aggregated facet return clause.
   * DSL: return in "metrics" funders aggregate rcr_avg, funding_usd sort by rcr_avg desc
   *
   * @param groupName - Name for the result group
   * @param field - Facet field name
   * @param indicators - Array of indicator names to aggregate
   * @param options - Optional sort and limit options
   * @returns This builder for chaining
   * @throws {ValidationError} If groupName, field, or indicators are invalid
   *
   * @example
   * ```typescript
   * const query = new QueryBuilder()
   *   .search("publications")
   *   .for("test")
   *   .returnGroupedAggregate("metrics", "funders", ["rcr_avg"], { sortBy: "rcr_avg" })
   *   .build();
   * // "... return in "metrics" funders aggregate rcr_avg sort by rcr_avg desc"
   * ```
   */
  returnGroupedAggregate(
    groupName: string,
    field: string,
    indicators: readonly string[],
    options?: {
      sortBy?: string;
      sortOrder?: SortOrder;
      limit?: number;
    },
  ): this {
    if (!groupName || groupName.trim().length === 0) {
      throw new ValidationError("Group name must be non-empty", { groupName });
    }
    validateFieldName(field);
    if (indicators.length === 0) {
      throw new ValidationError("Aggregate must have at least one indicator", {
        field,
      });
    }
    this.groupedClauses.push({
      type: "grouped",
      groupName,
      entityOrFacet: {
        type: "aggregated_facet",
        field,
        indicators,
        sortBy: options?.sortBy,
        sortOrder: options?.sortOrder ?? "desc",
        limit: options?.limit,
      },
    });
    return this;
  }

  /**
   * Builds the DSL query string.
   * @returns The constructed DSL query
   * @throws {ValidationError} If entity type is not set
   */
  build(): string {
    if (!this.entity) {
      throw new ValidationError("Entity type must be specified");
    }
    const parts: string[] = [];
    const searchTerms = this.searchTerms;

    // search <entity> [in <index>] for "<terms>" OR function expression search
    if (this.similarText) {
      const escapedText = escapeDslString(this.similarText);
      parts.push(`search ${this.entity} for similar_documents("${escapedText}")`);
    } else if (this.complexPhrase !== null) {
      const escapedPhrase = escapeDslString(this.complexPhrase);
      const indexPart =
        this.searchIndex && this.searchIndex !== "full_data" ? ` in ${this.searchIndex}` : "";
      parts.push(
        `search ${this.entity}${indexPart} for complex("${escapedPhrase}", ${this.complexMaxDist})`,
      );
    } else if (this.minShouldMatchPhrase !== null) {
      const escapedPhrase = escapeDslString(this.minShouldMatchPhrase);
      const indexPart =
        this.searchIndex && this.searchIndex !== "full_data" ? ` in ${this.searchIndex}` : "";
      parts.push(
        `search ${this.entity}${indexPart} for min_should_match("${escapedPhrase}", ${this.minShouldMatchMin})`,
      );
    } else if (searchTerms && this.searchIndex && this.searchIndex !== "full_data") {
      parts.push(
        `search ${this.entity} in ${this.searchIndex} for "${escapeDslString(searchTerms)}"`,
      );
    } else if (searchTerms) {
      parts.push(`search ${this.entity} for "${escapeDslString(searchTerms)}"`);
    } else {
      if (this.searchIndex && this.searchIndex !== "full_data") {
        throw new ValidationError("Search index requires search terms: call for() before in()");
      }
      parts.push(`search ${this.entity}`);
    }

    // Check for unbalanced parentheses
    if (this.groupDepth !== 0) {
      throw new ValidationError("Unbalanced parentheses: unclosed group");
    }

    // where <conditions> - build from expression tree
    if (this.expressionNodes.length > 0) {
      let whereStr = "";
      for (let i = 0; i < this.expressionNodes.length; i++) {
        const node = this.expressionNodes[i];
        const prevNode = i > 0 ? this.expressionNodes[i - 1] : null;

        if (this.shouldAddSpaceBefore(node, prevNode)) {
          whereStr += " ";
        }

        switch (node.type) {
          case "condition":
            whereStr += node.condition;
            break;
          case "connector":
            whereStr += node.connector;
            break;
          case "group_start":
            whereStr += "(";
            break;
          case "group_end":
            whereStr += ")";
            break;
        }
      }
      parts.push(`where ${whereStr}`);
    }

    // return <entity>[<fields>] or return <entity>
    // Note: return clause is required before limit/skip/sort modifiers
    // Note: fields must be separated with '+' not ','
    // Note: unnest() wraps fields that should be flattened
    const hasFields = this.returnFields.length > 0 || this.unnestFields.length > 0;
    const hasOtherReturnClauses =
      this.facetClauses.length > 0 ||
      this.timeSeriesClauses.length > 0 ||
      this.groupedClauses.length > 0;

    // Validate limit(0) usage - the Dimensions API rejects "return <entity> limit 0"
    if (this.limitValue === 0) {
      if (!hasOtherReturnClauses) {
        throw new ValidationError(
          "limit(0) requires at least one facet, time-series, or grouped return clause. " +
            "The Dimensions API does not support 'return <entity> limit 0'. " +
            "Use returnFacet(), returnCitationsPerYear(), or similar to get facet-only results.",
          { limit: 0 },
        );
      }
      if (hasFields) {
        throw new ValidationError(
          "limit(0) cannot be used with fields(). " +
            "The Dimensions API does not support 'return <entity>[fields] limit 0'. " +
            "Either remove fields() to get facet-only results, or use limit > 0.",
          { limit: 0, fields: this.returnFields },
        );
      }
    }

    // When limit=0 with facets/time-series/grouped returns and no fields,
    // skip the entire entity return section (return clause + modifiers).
    // User intent: "I don't want entity results, only facet results."
    const skipEntityReturn = this.limitValue === 0 && hasOtherReturnClauses && !hasFields;

    if (hasFields) {
      const allFieldParts: string[] = [];
      // Add regular fields
      for (const field of this.returnFields) {
        allFieldParts.push(field);
      }
      // Add unnested fields
      for (const field of this.unnestFields) {
        allFieldParts.push(`unnest(${field})`);
      }
      parts.push(`return ${this.entity}[${allFieldParts.join("+")}]`);
    } else if (
      !skipEntityReturn &&
      (this.sortField !== null || this.skipValue !== null || this.limitValue !== null)
    ) {
      // API requires return clause when using modifiers
      parts.push(`return ${this.entity}`);
    }

    // sort by <field> <order>
    // Skip when suppressing entity return (sort only applies to entity results)
    if (this.sortField && !skipEntityReturn) {
      parts.push(`sort by ${this.sortField} ${this.sortOrder}`);
    }

    // limit <n> (must come before skip)
    // Skip when suppressing entity return
    if (this.limitValue !== null && !skipEntityReturn) {
      parts.push(`limit ${this.limitValue}`);
    }

    // skip <n> (must come after limit)
    // Skip when suppressing entity return
    if (this.skipValue !== null && !skipEntityReturn) {
      parts.push(`skip ${this.skipValue}`);
    }

    // Facet return clauses
    for (const clause of this.facetClauses) {
      let facetDsl = `return ${clause.field}`;

      if (clause.type === "aggregated_facet" && clause.indicators.length > 0) {
        facetDsl += ` aggregate ${clause.indicators.join(", ")}`;
        if (clause.sortBy) {
          facetDsl += ` sort by ${clause.sortBy} ${clause.sortOrder}`;
        }
      }

      if (clause.limit !== undefined) {
        facetDsl += ` limit ${clause.limit}`;
      }

      parts.push(facetDsl);
    }

    // Time-series return clauses
    for (const clause of this.timeSeriesClauses) {
      if (clause.function === "citations_per_year") {
        parts.push(`return citations_per_year(${clause.startYear}, ${clause.endYear})`);
      } else if (clause.function === "funding_per_year") {
        parts.push(
          `return funding_per_year(${clause.startYear}, ${clause.endYear}, "${clause.currency}")`,
        );
      }
    }

    // Grouped return clauses
    for (const clause of this.groupedClauses) {
      const inner = clause.entityOrFacet;
      let groupedDsl = `return in "${escapeDslString(clause.groupName)}"`;

      if (inner.type === "entity") {
        if (inner.fields && inner.fields.length > 0) {
          groupedDsl += ` ${this.entity}[${inner.fields.join("+")}]`;
        } else {
          groupedDsl += ` ${this.entity}`;
        }
        if (inner.sortField) {
          groupedDsl += ` sort by ${inner.sortField} ${inner.sortOrder ?? "asc"}`;
        }
        if (inner.limit !== undefined) {
          groupedDsl += ` limit ${inner.limit}`;
        }
        if (inner.skip !== undefined) {
          groupedDsl += ` skip ${inner.skip}`;
        }
      } else if (inner.type === "facet") {
        groupedDsl += ` ${inner.field}`;
        if (inner.limit !== undefined) {
          groupedDsl += ` limit ${inner.limit}`;
        }
      } else if (inner.type === "aggregated_facet") {
        groupedDsl += ` ${inner.field} aggregate ${inner.indicators.join(", ")}`;
        if (inner.sortBy) {
          groupedDsl += ` sort by ${inner.sortBy} ${inner.sortOrder ?? "desc"}`;
        }
        if (inner.limit !== undefined) {
          groupedDsl += ` limit ${inner.limit}`;
        }
      }

      parts.push(groupedDsl);
    }

    return parts.join(" ");
  }

  /**
   * Creates a deep copy of this builder.
   * Useful when branching queries (e.g. adding different facets from a shared base).
   * @returns A new QueryBuilder with the same state
   */
  clone(): QueryBuilder {
    const copy = new QueryBuilder(this.schemaStore);
    copy.entity = this.entity;
    copy.searchIndex = this.searchIndex;
    copy.searchTerms = this.searchTerms;
    copy.similarText = this.similarText;
    copy.complexPhrase = this.complexPhrase;
    copy.complexMaxDist = this.complexMaxDist;
    copy.minShouldMatchPhrase = this.minShouldMatchPhrase;
    copy.minShouldMatchMin = this.minShouldMatchMin;
    copy.expressionNodes = [...this.expressionNodes];
    copy.groupDepth = this.groupDepth;
    copy.pendingConnector = this.pendingConnector;
    copy.returnFields = [...this.returnFields];
    copy.unnestFields = [...this.unnestFields];
    copy.sortField = this.sortField;
    copy.sortOrder = this.sortOrder;
    copy.skipValue = this.skipValue;
    copy.limitValue = this.limitValue;
    copy.facetClauses = [...this.facetClauses];
    copy.timeSeriesClauses = [...this.timeSeriesClauses];
    copy.groupedClauses = [...this.groupedClauses];
    return copy;
  }

  /**
   * Resets the builder to its initial state.
   * @returns This builder for chaining
   */
  reset(): this {
    this.entity = null;
    this.searchIndex = null;
    this.searchTerms = null;
    this.similarText = null;
    this.complexPhrase = null;
    this.complexMaxDist = null;
    this.minShouldMatchPhrase = null;
    this.minShouldMatchMin = null;
    this.expressionNodes = [];
    this.groupDepth = 0;
    this.pendingConnector = null;
    this.returnFields = [];
    this.unnestFields = [];
    this.sortField = null;
    this.sortOrder = "asc";
    this.skipValue = null;
    this.limitValue = null;
    this.facetClauses = [];
    this.timeSeriesClauses = [];
    this.groupedClauses = [];
    return this;
  }
}
