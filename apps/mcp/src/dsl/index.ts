/**
 * @digital-science/dimensions-dsl - DSL query builders and commands for Dimensions API.
 *
 * This package provides:
 * - DimensionsClient with fluent API and rawQuery
 * - QueryBuilder for DSL construction
 * - Function commands (classify, extract-*)
 * - Response parsers and runtime describe schema (`SchemaStore`)
 *
 * @module @digital-science/dimensions-dsl
 */

// Re-export core types for convenience
export type {
  Command,
  CommandInput,
  CommandOutput,
  DimensionsClientConfig,
  QueryExecutor,
} from "../client/index.js";
export {
  AuthenticationError,
  DimensionsError,
  NetworkError,
  QuerySyntaxError,
  RateLimitError,
  ServerError,
  TimeoutError,
  ValidationError,
} from "../client/index.js";
// Client
export { DimensionsClient, type RateLimitInfo } from "./client.js";
export { applyFilters } from "./commands/apply-filters.js";
export type { ExtendedWhereFilterInput, WhereFilterInput } from "./commands/index.js";
export {
  ClassifyCommand,
  type ClassifyCommandInput,
  type ClassifyCommandParsedInput,
  ClassifyInputSchema,
  EntitySchema,
  ExtendedWhereFilterSchema,
  ExtractAffiliationsCommand,
  type ExtractAffiliationsCommandInput,
  type ExtractAffiliationsCommandParsedInput,
  ExtractAffiliationsInputSchema,
  ExtractConceptsCommand,
  type ExtractConceptsCommandInput,
  type ExtractConceptsCommandParsedInput,
  ExtractConceptsInputSchema,
  ExtractGrantsCommand,
  type ExtractGrantsCommandInput,
  type ExtractGrantsCommandParsedInput,
  ExtractGrantsInputSchema,
  WhereFilterSchema,
} from "./commands/index.js";
export type {
  EntityTypeMap,
  FacetQueryResult,
  FluentQueryResult,
  TypedFacetResult,
} from "./fluent-query-builder.js";
export {
  FluentQueryBuilder,
  FluentQueryBuilderWithFacets,
} from "./fluent-query-builder.js";
// Pagination (Dimensions usage policy limits)
export {
  AGGREGATE_ID_CAP,
  type BatchPaginationOptions,
  buildPaginationMetadata,
  CONFIRM_LARGE_FETCH_PAGES,
  CONFIRM_LARGE_FETCH_RECORDS,
  DEFAULT_BATCH_MAX_PAGES,
  HARD_MAX_BATCH_PAGES,
  LARGE_RESULT_THRESHOLD,
  largeResultWarning,
  type PaginationInput,
  type PaginationMetadata,
  resolveSkipAndLimit,
  validateBatchPagination,
  validatePaginationBounds,
} from "./pagination.js";
// Query Builders
export { QueryBuilder } from "./query-builder.js";
// Response Parser
export {
  type EntityResult,
  type FacetFieldConfig,
  type ParseFacetOptions,
  parseEntityResponse,
  parseFacetResponse,
} from "./response-parser.js";
// Runtime describe schema
export type {
  DescribeField,
  DescribeSchemaResponse,
  DescribeVersionResponse,
  EntityDescribe,
  LoadSchemaOptions,
  SchemaCacheEntry,
  SchemaCacheEnvelope,
  SchemaLoadSource,
  SchemaSourceSummary,
  SchemaStoreMetadata,
  SchemaSummary,
  SourceDescribe,
  StructuredEntityType,
} from "./schema/index.js";
export {
  assertValidEntity,
  assertValidSearchIndex,
  buildSchemaSummary,
  clearSchemaCache,
  createSchemaStoreFromResponse,
  DEFAULT_SCHEMA_CACHE_TTL_MS,
  extractDescribeSchema,
  extractDescribeVersion,
  getCachedSchemaStore,
  getOrLoadSchema,
  isCacheFresh,
  loadSchema,
  parseCachePayload,
  SCHEMA_LIMITS,
  SCHEMA_RESOURCE_URIS,
  SchemaStore,
  STRUCTURED_ENTITY_TYPES,
  searchResultKey,
  searchToolName,
} from "./schema/index.js";
// Types (best-effort result shapes; field/facet/metric names come from SchemaStore)
export type {
  Affiliation,
  AffiliationInput,
  AffiliationResult,
  AggregatedFacetReturnClause,
  Author,
  BaseBucket,
  BucketWithAggregations,
  CategoryCode,
  ClassificationEntry,
  ClassificationSystem,
  ClassifyInput,
  ClassifyResponse,
  ClinicalTrial,
  ConceptBasic,
  ConceptScore,
  ConceptWithScore,
  Currency,
  Dataset,
  DimensionsEntityBase,
  EntityReturnClause,
  ExtractAffiliationsInput,
  ExtractAffiliationsResponse,
  ExtractConceptsInput,
  ExtractConceptsResponse,
  ExtractGrantsInput,
  ExtractGrantsResponse,
  FacetClause,
  FacetReturnClause,
  FunderOrg,
  Grant,
  GroupedReturnClause,
  Journal,
  Organization,
  Patent,
  PolicyDocument,
  Publication,
  Researcher,
  ResearchOrg,
  ReturnClause,
  TimeSeriesDataPoint,
  TimeSeriesFunction,
  TimeSeriesResult,
  TimeSeriesReturnClause,
  UnnestField,
} from "./types/index.js";
export { CLASSIFICATION_SYSTEMS, SUPPORTED_CURRENCIES } from "./types/index.js";
export type {
  EntityType,
  SearchIndex,
  SortOrder,
  WhereOperator,
} from "./types/vocabulary.js";
export {
  VALID_ENTITIES,
  VALID_INDEXES,
  VALID_OPERATORS,
} from "./types/vocabulary.js";
export {
  buildExecuteDslPolicyHints,
  buildUsagePolicy,
  type DslPaginationModifiers,
  type ExecuteDslPolicyOptions,
  isFacetOnlyQuery,
  POLICY_NOTICE,
  parseDslPagination,
  type SearchPolicyOptions,
  USAGE_POLICY_RESOURCE_URI,
  USAGE_POLICY_URL,
  type UsagePolicyPayload,
  validateExecuteDslPolicy,
  validateSearchPaginationPolicy,
} from "./usage-policy.js";
// Utils
export { escapeDslString } from "./utils/escape.js";
export { validateFieldName } from "./utils/validate-field-name.js";
