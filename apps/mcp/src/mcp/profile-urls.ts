/**
 * Canonical Dimensions web profile URLs.
 *
 * DSL `dimensions_url` is a publication discover facet for researchers and
 * organizations, not a profile page. LLMs then invent paths such as
 * `/discover/researcher/{id}` which 404 (WEBAPPDEV-13680 / DIMENTRY-10160).
 *
 * @module mcp/profile-urls
 */

/** Default Dimensions web host when `DIMENSIONS_BASE_URL` is unset. */
export const DEFAULT_INSTANCE_BASE_URL = "https://app.dimensions.ai";

/**
 * Path builders for entity types that have a canonical profile page.
 * Researcher and organization templates are from WEBAPPDEV-13680; other
 * document types match the live DSL `dimensions_url` path.
 */
const PROFILE_URL_PATHS = {
  publications: (id: string) => `/details/publication/${id}`,
  grants: (id: string) => `/details/grant/${id}`,
  patents: (id: string) => `/details/patent/${id}`,
  clinical_trials: (id: string) => `/details/clinical_trial/${id}`,
  datasets: (id: string) => `/details/data_set/${id}`,
  policy_documents: (id: string) => `/details/policy_documents/${id}`,
  researchers: (id: string) => `/details/entities/publication/author/${id}`,
  organizations: (id: string) => `/details/organization/${id}`,
} as const;

/** Entity types that have a canonical Dimensions web profile. */
export type ProfileEntityType = keyof typeof PROFILE_URL_PATHS;

/** Entity types that have a canonical Dimensions web profile. */
export const PROFILE_ENTITY_TYPES = Object.keys(PROFILE_URL_PATHS) as ProfileEntityType[];

/**
 * Facet fields whose bucket `id` is a profile entity (not a category label).
 */
const FACET_FIELD_PROFILE_ENTITY: Readonly<Record<string, ProfileEntityType>> = {
  researchers: "researchers",
  research_orgs: "organizations",
  funder_orgs: "organizations",
  current_research_org: "organizations",
};

/**
 * Strips trailing slashes from an instance base URL.
 * @param baseUrl - Raw instance URL
 * @returns Normalized origin with no trailing slash
 */
export function normalizeInstanceBaseUrl(baseUrl?: string): string {
  const raw = (baseUrl ?? process.env.DIMENSIONS_BASE_URL ?? DEFAULT_INSTANCE_BASE_URL).trim();
  return raw.replace(/\/+$/, "") || DEFAULT_INSTANCE_BASE_URL;
}

/**
 * Whether `entityType` has a canonical Dimensions profile page.
 * @param entityType - DSL source or entity name
 */
export function isProfileEntityType(entityType: string): entityType is ProfileEntityType {
  return Object.hasOwn(PROFILE_URL_PATHS, entityType);
}

/**
 * Builds a canonical Dimensions profile URL, or `undefined` when the entity
 * type has no profile page or the id is empty.
 * @param entityType - DSL source name (e.g. `researchers`)
 * @param id - Dimensions record id
 * @param instanceBaseUrl - Web instance origin (defaults to `DIMENSIONS_BASE_URL`)
 */
export function buildProfileUrl(
  entityType: string,
  id: string,
  instanceBaseUrl?: string,
): string | undefined {
  if (!isProfileEntityType(entityType)) return undefined;
  const trimmed = id.trim();
  if (!trimmed) return undefined;
  const base = normalizeInstanceBaseUrl(instanceBaseUrl);
  return `${base}${PROFILE_URL_PATHS[entityType](encodeURIComponent(trimmed))}`;
}

/**
 * Returns the profile entity type for a facet field, if bucket ids are profiles.
 * @param facetField - Facet field name after alias resolution
 */
export function profileEntityForFacetField(facetField: string): ProfileEntityType | undefined {
  return FACET_FIELD_PROFILE_ENTITY[facetField];
}

/**
 * Adds `profile_url` when the record has an id and the entity has a profile page.
 * @param entityType - DSL source name
 * @param record - Result row
 * @param instanceBaseUrl - Web instance origin
 */
export function attachProfileUrl<T extends Record<string, unknown>>(
  entityType: string,
  record: T,
  instanceBaseUrl?: string,
): T {
  const id = record.id;
  if (typeof id !== "string" && typeof id !== "number") return record;
  const profileUrl = buildProfileUrl(entityType, String(id), instanceBaseUrl);
  if (!profileUrl) return record;
  return { ...record, profile_url: profileUrl };
}

/**
 * Adds `profile_url` to each record that has a usable id.
 * @param entityType - DSL source name
 * @param records - Result rows
 * @param instanceBaseUrl - Web instance origin
 */
export function attachProfileUrls<T extends Record<string, unknown>>(
  entityType: string,
  records: readonly T[],
  instanceBaseUrl?: string,
): T[] {
  return records.map((record) => attachProfileUrl(entityType, record, instanceBaseUrl));
}

/**
 * Adds `profile_url` to facet buckets when the facet field is a profile entity.
 * @param facetField - Facet field name after alias resolution
 * @param buckets - Facet buckets
 * @param instanceBaseUrl - Web instance origin
 */
export function attachFacetProfileUrls(
  facetField: string,
  buckets: readonly object[],
  instanceBaseUrl?: string,
): Record<string, unknown>[] {
  const rows = buckets.map((bucket) => ({ ...(bucket as Record<string, unknown>) }));
  const profileEntity = profileEntityForFacetField(facetField);
  if (!profileEntity) return rows;
  return attachProfileUrls(profileEntity, rows, instanceBaseUrl);
}

/** Catalog entry for one profile URL template. */
export interface ProfileUrlTemplate {
  readonly entityType: ProfileEntityType;
  readonly path: string;
  readonly exampleId: string;
  readonly exampleUrl: string;
}

const TEMPLATE_EXAMPLES: Readonly<Record<ProfileEntityType, string>> = {
  publications: "pub.1015581115",
  grants: "grant.2438800",
  patents: "ZW-9994-A1",
  clinical_trials: "chictr-trc-14005205",
  datasets: "dataset.99999999",
  policy_documents: "policy.9999",
  researchers: "ur.01222634304.39",
  organizations: "grid.168010.e",
};

/**
 * Documented profile URL templates for MCP resources and agent instructions.
 * @param instanceBaseUrl - Web instance origin
 */
export function profileUrlCatalog(instanceBaseUrl?: string): {
  instanceBaseUrl: string;
  warning: string;
  templates: ProfileUrlTemplate[];
} {
  const base = normalizeInstanceBaseUrl(instanceBaseUrl);
  return {
    instanceBaseUrl: base,
    warning:
      "Never invent Dimensions web URLs. Researcher profiles are /details/entities/publication/author/{id}, not /discover/researcher/{id}. Organization profiles are /details/organization/{id}. DSL dimensions_url for researchers and organizations is a publication discover facet, not a profile.",
    templates: PROFILE_ENTITY_TYPES.map((entityType) => {
      const exampleId = TEMPLATE_EXAMPLES[entityType];
      const exampleUrl = buildProfileUrl(entityType, exampleId, base) ?? "";
      const path = exampleUrl.slice(base.length).replace(encodeURIComponent(exampleId), "{id}");
      return { entityType, path, exampleId, exampleUrl };
    }),
  };
}
