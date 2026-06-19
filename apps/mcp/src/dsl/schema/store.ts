/**
 * In-memory schema store built from `describe schema` responses.
 * @module schema/store
 */

import { STRUCTURED_ENTITY_TYPES, type StructuredEntityType } from "./structured-entities.js";
import { buildSchemaSummary, type SchemaSummary } from "./summary.js";
import type { DescribeSchemaResponse, EntityDescribe, SourceDescribe } from "./types.js";

/** How the schema store was populated. */
export type SchemaLoadSource = "api" | "cache";

/** Optional metadata when constructing a {@link SchemaStore}. */
export type SchemaStoreMetadata = {
  readonly loadSource?: SchemaLoadSource;
  readonly stale?: boolean;
  readonly cachedAt?: Date;
};

/** Operational limits mirrored from upstream DSL constants. */
export const SCHEMA_LIMITS = {
  maxLimit: 1000,
  maxOffset: 50000,
  maxPages: 50,
  maxFacetBuckets: 1000,
  requestsPerMinute: 30,
} as const;

/**
 * Read-only schema catalog with derived helper views for tools and clients.
 */
export class SchemaStore {
  readonly #version: string | undefined;
  readonly #loadedAt: Date;
  readonly #loadSource: SchemaLoadSource;
  readonly #stale: boolean;
  readonly #cachedAt: Date | undefined;
  readonly #sources: ReadonlyMap<string, SourceDescribe>;
  readonly #entities: ReadonlyMap<string, EntityDescribe>;
  readonly #raw: DescribeSchemaResponse;

  /**
   * @param response - Parsed `describe schema` payload
   * @param version - Optional DSL version from `describe version`
   * @param loadedAt - Timestamp when schema was loaded
   * @param metadata - Cache/API provenance
   */
  constructor(
    response: DescribeSchemaResponse,
    version?: string,
    loadedAt: Date = new Date(),
    metadata: SchemaStoreMetadata = {},
  ) {
    this.#raw = response;
    this.#version = version;
    this.#loadedAt = loadedAt;
    this.#loadSource = metadata.loadSource ?? "api";
    this.#stale = metadata.stale ?? false;
    this.#cachedAt = metadata.cachedAt;
    this.#sources = new Map(Object.entries(response.sources ?? {}));
    this.#entities = new Map(Object.entries(response.entities ?? {}));
  }

  /** Whether schema came from the API or disk cache. */
  get loadSource(): SchemaLoadSource {
    return this.#loadSource;
  }

  /** True when serving from cache after an API failure or expired TTL. */
  get stale(): boolean {
    return this.#stale;
  }

  /** When the on-disk cache was written, if known. */
  get cachedAt(): Date | undefined {
    return this.#cachedAt;
  }

  /** DSL version string, if known. */
  get version(): string | undefined {
    return this.#version;
  }

  /** When this store was populated. */
  get loadedAt(): Date {
    return this.#loadedAt;
  }

  /** Full describe payload. */
  get raw(): DescribeSchemaResponse {
    return this.#raw;
  }

  /** All source names. */
  sourceNames(): readonly string[] {
    return [...this.#sources.keys()].sort();
  }

  /** All auxiliary entity names. */
  entityNames(): readonly string[] {
    return [...this.#entities.keys()].sort();
  }

  /**
   * Returns a source schema by name.
   * @param name - Source name (e.g. `publications`)
   * @returns Source schema or undefined
   */
  getSource(name: string): SourceDescribe | undefined {
    return this.#sources.get(name);
  }

  /**
   * Returns an auxiliary entity schema by name.
   * @param name - Entity name (e.g. `journals`)
   * @returns Entity schema or undefined
   */
  getEntity(name: string): EntityDescribe | undefined {
    return this.#entities.get(name);
  }

  /**
   * Filterable field names for a source.
   * @param source - Source name
   * @returns Field names where `is_filter` is true
   */
  filterableFields(source: string): readonly string[] {
    const fields = this.#sources.get(source)?.fields ?? {};
    return Object.entries(fields)
      .filter(([, f]) => f.is_filter === true)
      .map(([name]) => name)
      .sort();
  }

  /**
   * Facet field names for a source.
   * @param source - Source name
   * @returns Field names marked as facets or entity fields
   */
  facetFields(source: string): readonly string[] {
    const fields = this.#sources.get(source)?.fields ?? {};
    return Object.entries(fields)
      .filter(([, f]) => f.is_facet === true || f.is_entity === true)
      .map(([name]) => name)
      .sort();
  }

  /**
   * Search index names for a source.
   * @param source - Source name
   * @returns Search field/index names
   */
  searchIndexes(source: string): readonly string[] {
    const raw = this.#sources.get(source)?.search_fields;
    if (!raw) return [];
    if (Array.isArray(raw)) return [...raw].sort();
    return Object.keys(raw).sort();
  }

  /**
   * Aggregation indicator names for a source.
   * @param source - Source name
   * @returns Metric names
   */
  metrics(source: string): readonly string[] {
    const raw = this.#sources.get(source)?.metrics;
    if (!raw) return [];
    if (Array.isArray(raw)) return [...raw].sort();
    return Object.keys(raw).sort();
  }

  /**
   * Named fieldsets for a source.
   * @param source - Source name
   * @returns Fieldset name to field list map
   */
  fieldsets(source: string): Readonly<Record<string, readonly string[]>> {
    return this.#sources.get(source)?.fieldsets ?? {};
  }

  /**
   * Core entity types supported by structured search tools.
   * @returns Structured sources that exist in the loaded describe schema
   */
  structuredEntityTypes(): readonly StructuredEntityType[] {
    return STRUCTURED_ENTITY_TYPES.filter((entity) => this.#sources.has(entity));
  }

  /**
   * Health/stats payload for `/health`.
   * @returns Summary object
   */
  stats(): {
    dslVersion: string | undefined;
    sourceCount: number;
    entityCount: number;
    schemaLoadedAt: string;
    loadSource: SchemaLoadSource;
    stale: boolean;
    cachedAt: string | undefined;
  } {
    return {
      dslVersion: this.#version,
      sourceCount: this.#sources.size,
      entityCount: this.#entities.size,
      schemaLoadedAt: this.#loadedAt.toISOString(),
      loadSource: this.#loadSource,
      stale: this.#stale,
      cachedAt: this.#cachedAt?.toISOString(),
    };
  }

  /**
   * Compact overview for cold-start discovery (fields, facets, resource URIs).
   * @returns Summary payload
   */
  summary(): SchemaSummary {
    return buildSchemaSummary(this);
  }

  /**
   * Comma-separated facet fields for tool descriptions.
   * @param source - Source name
   * @returns Hint string
   */
  facetFieldsHint(source: string): string {
    return this.facetFields(source).join(", ") || "(none)";
  }

  /**
   * Comma-separated metrics for tool descriptions.
   * @param source - Source name
   * @returns Hint string
   */
  metricsHint(source: string): string {
    return this.metrics(source).join(", ") || "(none)";
  }
}

/**
 * Builds a {@link SchemaStore} from a describe response.
 * @param response - `describe schema` JSON
 * @param version - Optional DSL version
 * @returns Schema store instance
 */
export function createSchemaStoreFromResponse(
  response: DescribeSchemaResponse,
  version?: string,
  loadedAt?: Date,
  metadata?: SchemaStoreMetadata,
): SchemaStore {
  return new SchemaStore(response, version, loadedAt, metadata);
}
