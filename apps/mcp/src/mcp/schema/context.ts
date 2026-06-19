/**
 * Mutable schema context shared across MCP resources and tools.
 * @module schema/context
 */

import type { SchemaStore } from "../../dsl/index.js";

/** Mutable holder so refresh can update the active store without re-registering resources. */
export type SchemaContext = {
  store: SchemaStore;
};
