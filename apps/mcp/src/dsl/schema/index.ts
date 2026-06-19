/**
 * Runtime schema from `describe schema` / `describe version`.
 * @module schema
 */

export {
  DEFAULT_SCHEMA_CACHE_TTL_MS,
  isCacheFresh,
  parseCachePayload,
  type SchemaCacheEntry,
  type SchemaCacheEnvelope,
} from "./cache.js";
export { extractDescribeSchema, extractDescribeVersion } from "./extract.js";
export {
  clearSchemaCache,
  getCachedSchemaStore,
  getOrLoadSchema,
  type LoadSchemaOptions,
  loadSchema,
} from "./load.js";
export {
  createSchemaStoreFromResponse,
  SCHEMA_LIMITS,
  type SchemaLoadSource,
  SchemaStore,
  type SchemaStoreMetadata,
} from "./store.js";
export {
  STRUCTURED_ENTITY_TYPES,
  type StructuredEntityType,
  searchResultKey,
  searchToolName,
} from "./structured-entities.js";
export {
  buildSchemaSummary,
  SCHEMA_RESOURCE_URIS,
  type SchemaSourceSummary,
  type SchemaSummary,
} from "./summary.js";
export type {
  DescribeField,
  DescribeSchemaResponse,
  DescribeVersionResponse,
  EntityDescribe,
  SourceDescribe,
} from "./types.js";
export {
  assertValidEntity,
  assertValidSearchIndex,
} from "./validation.js";
