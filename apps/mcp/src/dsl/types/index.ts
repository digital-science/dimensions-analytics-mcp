/**
 * Type definitions for Dimensions API.
 * @module types
 */

export type { BaseBucket, BucketWithAggregations } from "./buckets.js";

export type {
  Affiliation,
  Author,
  CategoryCode,
  ConceptScore,
  FunderOrg,
  Journal,
  QueryExecutor,
  ResearchOrg,
} from "./common.js";

export type {
  ClinicalTrial,
  Dataset,
  DimensionsEntityBase,
  Grant,
  Organization,
  Patent,
  PolicyDocument,
  Publication,
  Researcher,
} from "./entities.js";

export type {
  AggregatedFacetReturnClause,
  Currency,
  EntityReturnClause,
  FacetClause,
  FacetReturnClause,
  GroupedReturnClause,
  ReturnClause,
  TimeSeriesDataPoint,
  TimeSeriesFunction,
  TimeSeriesResult,
  TimeSeriesReturnClause,
  UnnestField,
} from "./return-clauses.js";
export { SUPPORTED_CURRENCIES } from "./return-clauses.js";

export type {
  AffiliationInput,
  AffiliationResult,
  ClassificationEntry,
  ClassificationSystem,
  ClassifyInput,
  ClassifyResponse,
  ConceptBasic,
  ConceptWithScore,
  ExtractAffiliationsInput,
  ExtractAffiliationsResponse,
  ExtractConceptsInput,
  ExtractConceptsResponse,
  ExtractGrantsInput,
  ExtractGrantsResponse,
} from "./special-functions.js";
export { CLASSIFICATION_SYSTEMS } from "./special-functions.js";
