/**
 * Type definitions for Dimensions DSL special functions.
 * Includes types for classify(), extract_concepts(), and similar_documents().
 * @module types/special-functions
 */

/**
 * Array of valid classification systems for runtime validation.
 * Use this constant in Zod schemas and other runtime checks.
 */
export const CLASSIFICATION_SYSTEMS = [
  "FOR",
  "FOR_2020",
  "SDG",
  "SDG_2021",
  "RCDC",
  "HRCS_HC",
  "HRCS_RAC",
  "HRA",
  "BRA",
  "ICRP_CSO",
  "ICRP_CT",
  "UOA",
] as const;

/**
 * Classification systems supported by the Dimensions API.
 * These systems categorize research into standardized taxonomies.
 */
export type ClassificationSystem =
  | "FOR"
  | "FOR_2020"
  | "SDG"
  | "SDG_2021"
  | "RCDC"
  | "HRCS_HC"
  | "HRCS_RAC"
  | "HRA"
  | "BRA"
  | "ICRP_CSO"
  | "ICRP_CT"
  | "UOA";

/**
 * A single classification entry returned by the classify() function.
 * Contains an identifier and human-readable name for a category.
 */
export interface ClassificationEntry {
  /** The classification code identifier */
  readonly id: string;
  /** The human-readable name of the classification */
  readonly name: string;
}

/**
 * Response from the classify() function.
 * Keys are the classification system name, values are arrays of classification entries.
 *
 * @template S - The classification system type
 *
 * @example
 * ```typescript
 * // FOR classification response
 * const response: ClassifyResponse<"FOR"> = {
 *   FOR: [
 *     { id: "1117", name: "Public Health and Health Services" },
 *     { id: "1103", name: "Clinical Sciences" }
 *   ]
 * };
 * ```
 */
export type ClassifyResponse<S extends ClassificationSystem = ClassificationSystem> = {
  readonly [K in S]: readonly ClassificationEntry[];
};

/**
 * A concept extracted without a relevance score.
 * Used when return_scores is false or not specified.
 */
export interface ConceptBasic {
  /** The extracted concept string */
  readonly concept: string;
}

/**
 * A concept extracted with its relevance score.
 * Used when return_scores=true is specified.
 */
export interface ConceptWithScore {
  /** The extracted concept string */
  readonly concept: string;
  /** Relevance score indicating how strongly the concept relates to the text */
  readonly relevance: number;
}

/**
 * Response from the extract_concepts() function.
 * Structure depends on whether return_scores was requested.
 *
 * @template WithScores - Whether relevance scores are included
 *
 * @example
 * ```typescript
 * // Without scores (default)
 * const simple: ExtractConceptsResponse<false> = {
 *   extracted_concepts: ["machine learning", "neural networks", "deep learning"]
 * };
 *
 * // With scores
 * const withScores: ExtractConceptsResponse<true> = {
 *   extracted_concepts: [
 *     { concept: "machine learning", relevance: 0.95 },
 *     { concept: "neural networks", relevance: 0.87 }
 *   ]
 * };
 * ```
 */
export type ExtractConceptsResponse<WithScores extends boolean = false> = WithScores extends true
  ? { readonly extracted_concepts: readonly ConceptWithScore[] }
  : { readonly extracted_concepts: readonly string[] };

/**
 * Input parameters for the classify() function.
 */
export interface ClassifyInput {
  /** Document title (at least title or abstract must be provided) */
  readonly title?: string;
  /** Document abstract (at least title or abstract must be provided) */
  readonly abstract?: string;
  /** Classification system to use */
  readonly system: ClassificationSystem;
}

/**
 * Input parameters for the extract_concepts() function.
 */
export interface ExtractConceptsInput {
  /** Text to extract concepts from */
  readonly text: string;
  /** Whether to include relevance scores in the response */
  readonly returnScores?: boolean;
}

// #region extract_affiliations() Types

/**
 * A single affiliation input for extract_affiliations().
 * Can be either freetext (affiliation field) or structured (name, city, state, country).
 */
export interface AffiliationInput {
  /** Freetext affiliation string (use this OR structured fields) */
  readonly affiliation?: string;
  /** Organization name (structured input) */
  readonly name?: string;
  /** City (structured input) */
  readonly city?: string;
  /** State/province (structured input) */
  readonly state?: string;
  /** Country (structured input) */
  readonly country?: string;
}

/**
 * Input parameters for the extract_affiliations() function.
 */
export interface ExtractAffiliationsInput {
  /** Array of affiliation inputs to resolve */
  readonly affiliations: readonly AffiliationInput[];
  /** Results detail level: "basic" (default), "full", or "publisher" */
  readonly results?: "basic" | "full" | "publisher";
}

/**
 * A single affiliation result from extract_affiliations().
 */
export interface AffiliationResult {
  /** The organization identifier (e.g., "grid.xxx" or "or.xxx") */
  readonly id: string;
  /** The canonical organization name */
  readonly name: string;
  /** Country of the organization */
  readonly country?: string;
  /** Match confidence score (0-1) */
  readonly score?: number;
}

/**
 * Response from the extract_affiliations() function.
 */
export interface ExtractAffiliationsResponse {
  readonly extracted_affiliations: readonly AffiliationResult[];
}

// #endregion

// #region extract_grants() Types

/**
 * Input parameters for the extract_grants() function.
 */
export interface ExtractGrantsInput {
  /** Grant number to look up */
  readonly grantNumber: string;
  /** FundRef ID of the funder (alternative to funderName) */
  readonly fundref?: string;
  /** Funder name (alternative to fundref) */
  readonly funderName?: string;
}

/**
 * Response from the extract_grants() function.
 * The Dimensions API resolves a grant number to a single grant ID.
 * Returns `null` when no matching grant is found.
 */
export interface ExtractGrantsResponse {
  /** Resolved Dimensions grant ID (e.g. "grant.2544064"), or null if not found */
  readonly grant_id: string | null;
}

// #endregion
