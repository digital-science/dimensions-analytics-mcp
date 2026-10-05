/**
 * Mutable schema context shared across MCP resources and tools.
 * @module schema/context
 */

import type { SchemaStore } from "../../dsl/index.js";

/** Mutable holder so refresh can update the active store without re-registering resources. */
export type SchemaContext = {
  store: SchemaStore;
  /** Disk cache written by schema refreshes (local stdio default cache, or `SCHEMA_CACHE_PATH`). */
  readonly cachePath?: string;
};
