/**
 * Common type definitions shared across Dimensions API entities.
 * @module types/common
 */

/**
 * Represents an author of a publication or other research output.
 */
export interface Author {
  /** Dimensions author ID */
  id?: string;
  /** Author's first name */
  first_name?: string;
  /** Author's last name */
  last_name?: string;
  /** Author's full name (if first/last not available) */
  full_name?: string;
  /** ORCID identifier */
  orcid?: string;
  /** Author's institutional affiliations */
  affiliations?: Affiliation[];
}

/**
 * Represents an institutional affiliation.
 */
export interface Affiliation {
  /** Dimensions affiliation ID */
  id?: string;
  /** Institution name */
  name: string;
  /** City where institution is located */
  city?: string;
  /** State/province where institution is located */
  state?: string;
  /** Country where institution is located */
  country?: string;
}

/**
 * Represents a research organization (university, institute, etc.).
 */
export interface ResearchOrg {
  /** Dimensions organization ID */
  id?: string;
  /** Organization name */
  name: string;
  /** City where organization is located */
  city?: string;
  /** Country where organization is located */
  country?: string;
}

/**
 * Represents a funding organization.
 */
export interface FunderOrg {
  /** Dimensions funder ID */
  id?: string;
  /** Funder name */
  name: string;
  /** Funder acronym (e.g., "NIH", "NSF") */
  acronym?: string;
  /** Country where funder is based */
  country?: string;
}

/**
 * Represents a category code (FOR, SDG, etc.).
 */
export interface CategoryCode {
  /** Category code identifier */
  id: string;
  /** Category name */
  name: string;
}

/**
 * Represents a concept with its relevance score.
 */
export interface ConceptScore {
  /** Concept name */
  concept: string;
  /** Relevance score */
  relevance: number;
}

/**
 * Represents a journal or publication venue.
 */
export interface Journal {
  /** Dimensions journal ID */
  id?: string;
  /** Journal title */
  title: string;
}

// Re-export QueryExecutor from core for backwards compatibility
export type { QueryExecutor } from "../../client/index.js";
