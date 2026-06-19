/**
 * Entity type definitions for Dimensions API responses.
 *
 * Best-effort TypeScript shapes for API result rows. Field names and availability
 * come from live `describe schema` (see {@link SchemaStore}); these types are not
 * validated at runtime.
 *
 * @module types/entities
 */

/**
 * Base row returned by structured search — always includes `id`; other fields vary by source.
 */
export interface DimensionsEntityBase {
  /** Dimensions record ID */
  id: string;
  /** Additional fields from the API (see describe schema / return clause) */
  [key: string]: unknown;
}

/** @see DimensionsEntityBase */
export type Publication = DimensionsEntityBase;

/** @see DimensionsEntityBase */
export type Grant = DimensionsEntityBase;

/** @see DimensionsEntityBase */
export type Researcher = DimensionsEntityBase;

/** @see DimensionsEntityBase */
export type Patent = DimensionsEntityBase;

/** @see DimensionsEntityBase */
export type ClinicalTrial = DimensionsEntityBase;

/** @see DimensionsEntityBase */
export type Dataset = DimensionsEntityBase;

/** @see DimensionsEntityBase */
export type PolicyDocument = DimensionsEntityBase;

/** @see DimensionsEntityBase */
export type Organization = DimensionsEntityBase;
