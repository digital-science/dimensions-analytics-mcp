/**
 * Runtime schema loading and access for the MCP server.
 * @module schema
 */

export type {
  DescribeField,
  DescribeSchemaResponse,
  DescribeVersionResponse,
  EntityDescribe,
  LoadSchemaOptions,
  SchemaCacheEntry,
  SchemaCacheEnvelope,
  SchemaLoadSource,
  SchemaSourceSummary,
  SchemaStoreMetadata,
  SchemaSummary,
  SourceDescribe,
  StructuredEntityType,
} from "../../dsl/index.js";
export {
  buildSchemaSummary,
  clearSchemaCache,
  createSchemaStoreFromResponse,
  DEFAULT_SCHEMA_CACHE_TTL_MS,
  extractDescribeSchema,
  extractDescribeVersion,
  getCachedSchemaStore,
  getOrLoadSchema,
  loadSchema,
  SCHEMA_LIMITS,
  SCHEMA_RESOURCE_URIS,
  SchemaStore,
  STRUCTURED_ENTITY_TYPES,
  searchResultKey,
  searchToolName,
} from "../../dsl/index.js";
export type { SchemaContext } from "./context.js";
