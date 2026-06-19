/**
 * Structured search entity types supported by search tools.
 * @module schema/structured-entities
 */

/** Source names that have dedicated structured search tools. */
export const STRUCTURED_ENTITY_TYPES = [
  "publications",
  "grants",
  "researchers",
  "patents",
  "clinical_trials",
  "datasets",
  "policy_documents",
  "organizations",
] as const;

/** A source with a structured search tool. */
export type StructuredEntityType = (typeof STRUCTURED_ENTITY_TYPES)[number];

/**
 * Tool name for a structured entity.
 * @param source - Dimensions source name
 * @returns Tool name (e.g. `search_publications`)
 */
export function searchToolName(source: StructuredEntityType): string {
  return `search_${source}`;
}

/**
 * JSON result key for entity rows (camelCase where historical tools used it).
 * @param source - Dimensions source name
 * @returns Property name in tool output
 */
export function searchResultKey(source: StructuredEntityType): string {
  switch (source) {
    case "clinical_trials":
      return "clinicalTrials";
    case "policy_documents":
      return "policyDocuments";
    default:
      return source;
  }
}
