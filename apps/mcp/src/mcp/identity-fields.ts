/**
 * Identity fields that structured search/lookup always returns (WEBAPPDEV-13816).
 * Default DSL fieldsets omit `doi` on publications, and agents often request
 * title-only field lists — both make it hard to open or cite a record.
 *
 * @module mcp/identity-fields
 */

/** Fields that uniquely identify a record, by entity type. */
const IDENTITY_FIELDS: Readonly<Record<string, readonly string[]>> = {
  publications: ["id", "doi"],
  grants: ["id"],
  researchers: ["id"],
  patents: ["id"],
  clinical_trials: ["id"],
  datasets: ["id"],
  policy_documents: ["id"],
  organizations: ["id"],
  reports: ["id"],
  source_titles: ["id"],
  funder_groups: ["id"],
  research_org_groups: ["id"],
};

/** DSL fieldset that matches the API default list payload. */
const DEFAULT_FIELDSET = "basics";

/**
 * Identity fields for a source (defaults to `id`).
 * @param entityType - DSL source name
 */
export function identityFieldsFor(entityType: string): readonly string[] {
  return IDENTITY_FIELDS[entityType] ?? ["id"];
}

/**
 * Deduplicates strings while preserving first-seen order.
 * @param items - Field names
 */
function unique(items: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    if (seen.has(item)) continue;
    seen.add(item);
    out.push(item);
  }
  return out;
}

/**
 * Ensures identity fields are present in a return-clause field list.
 * When the caller omits `fields`, keeps the default `basics` fieldset and
 * adds identifiers (so publication lists include `doi` without dropping authors).
 *
 * @param entityType - DSL source name
 * @param fields - Caller-requested fields after alias resolution
 */
export function mergeIdentityFields(entityType: string, fields?: readonly string[]): string[] {
  const identity = identityFieldsFor(entityType);
  if (!fields?.length) {
    return unique([DEFAULT_FIELDSET, ...identity]);
  }
  return unique([...identity, ...fields]);
}
