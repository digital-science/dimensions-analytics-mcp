/**
 * Compact schema summary for cold-start and agent discovery.
 * @module schema/summary
 */

import { SCHEMA_LIMITS, type SchemaStore } from "./store.js";

/** MCP resource URIs for drilling into the full schema. */
export const SCHEMA_RESOURCE_URIS = {
  full: "dimensions://schema",
  summary: "dimensions://schema/summary",
  version: "dimensions://schema/version",
  limits: "dimensions://schema/limits",
  policy: "dimensions://schema/policy",
  fields: "dimensions://fields/{entityType}",
  source: "dimensions://schema/sources/{sourceName}",
  entity: "dimensions://schema/entities/{entityName}",
  examples: "dimensions://examples",
  examplesBySource: "dimensions://examples/{source}",
} as const;

/** Per-source counts derived from describe schema. */
export type SchemaSourceSummary = {
  readonly filterableFieldCount: number;
  readonly facetFieldCount: number;
  readonly searchIndexCount: number;
  readonly metricCount: number;
  readonly fieldsetNames: readonly string[];
};

/** Compact schema overview for agents and MCP tools. */
export type SchemaSummary = {
  readonly version: string | undefined;
  readonly loadedAt: string;
  readonly cachedAt: string | undefined;
  readonly stale: boolean;
  readonly loadSource: "api" | "cache";
  readonly limits: typeof SCHEMA_LIMITS;
  readonly stats: {
    readonly sourceCount: number;
    readonly entityCount: number;
    readonly structuredEntityTypes: readonly string[];
  };
  readonly sources: Readonly<Record<string, SchemaSourceSummary>>;
  readonly entities: readonly string[];
  readonly resources: typeof SCHEMA_RESOURCE_URIS;
  readonly hint: string;
};

/**
 * Builds a compact schema summary from a loaded {@link SchemaStore}.
 * @param store - Loaded schema store
 * @returns Summary payload for tools and resources
 */
export function buildSchemaSummary(store: SchemaStore): SchemaSummary {
  const sources: Record<string, SchemaSourceSummary> = {};
  for (const name of store.sourceNames()) {
    const fieldsets = store.fieldsets(name);
    sources[name] = {
      filterableFieldCount: store.filterableFields(name).length,
      facetFieldCount: store.facetFields(name).length,
      searchIndexCount: store.searchIndexes(name).length,
      metricCount: store.metrics(name).length,
      fieldsetNames: Object.keys(fieldsets).sort(),
    };
  }

  const stats = store.stats();
  const staleNote = store.stale
    ? " (stale cache — call refresh_schema when the API is reachable)"
    : "";

  return {
    version: store.version,
    loadedAt: store.loadedAt.toISOString(),
    cachedAt: store.cachedAt?.toISOString(),
    stale: store.stale,
    loadSource: store.loadSource,
    limits: SCHEMA_LIMITS,
    stats: {
      sourceCount: stats.sourceCount,
      entityCount: stats.entityCount,
      structuredEntityTypes: store.structuredEntityTypes(),
    },
    sources,
    entities: store.entityNames(),
    resources: SCHEMA_RESOURCE_URIS,
    hint:
      `Use dimensions://fields/{entityType} for filterable fields and aliases. ` +
      `Read dimensions://schema/policy before large paginated pulls. ` +
      `Use dimensions://schema/sources/{name} or describe_schema with source/entity for detail. ` +
      `Full raw describe: describe_schema with full=true or dimensions://schema.${staleNote}`,
  };
}
