/**
 * Dimensions DSL vocabulary types and runtime validation lists.
 * @module types/vocabulary
 */

/** Comparison operators supported in WHERE clause filters. */
export type Operator = "=" | "!=" | "<" | ">" | "<=" | ">=" | "in" | "~" | "@";

/** Backward-compatible alias for {@link Operator}. */
export type WhereOperator = Operator;

/** Supported entity types (data sources) in the Dimensions DSL. */
export type EntityType =
  | "publications"
  | "grants"
  | "researchers"
  | "patents"
  | "clinical_trials"
  | "datasets"
  | "policy_documents"
  | "organizations";

/** Search indexes for `search <source> in <index> for "..."` clauses. */
export type SearchIndex =
  | "full_data"
  | "full_data_exact"
  | "title_abstract_only"
  | "title_only"
  | "authors"
  | "inventors"
  | "investigators"
  | "concepts"
  | "funding"
  | "acknowledgements"
  | "raw_affiliations"
  | "assignees"
  | "title_abstract_claims";

/** Sort direction for order-by clauses. */
export type SortOrder = "asc" | "desc";

/** Valid operators for runtime validation. */
export const VALID_OPERATORS: readonly Operator[] = [
  "=",
  "!=",
  ">",
  "<",
  ">=",
  "<=",
  "in",
  "~",
  "@",
] as const;

/** Valid entity types for runtime validation. */
export const VALID_ENTITIES: readonly EntityType[] = [
  "publications",
  "grants",
  "researchers",
  "patents",
  "clinical_trials",
  "datasets",
  "policy_documents",
  "organizations",
] as const;

/** Valid search indexes for runtime validation. */
export const VALID_INDEXES: readonly SearchIndex[] = [
  "full_data",
  "full_data_exact",
  "title_abstract_only",
  "title_only",
  "authors",
  "inventors",
  "investigators",
  "concepts",
  "funding",
  "acknowledgements",
  "raw_affiliations",
  "assignees",
  "title_abstract_claims",
] as const;
