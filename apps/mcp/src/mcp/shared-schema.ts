/**
 * Process-wide describe schema cache for hosted deployment.
 * @module mcp/shared-schema
 */

import type { DimensionsClient } from "../dsl/index.js";
import { getOrLoadSchema, type SchemaStore } from "../dsl/schema/index.js";

let sharedSchemaStore: SchemaStore | undefined;
let sharedSchemaPromise: Promise<SchemaStore> | undefined;

/**
 * Returns a shared SchemaStore, loading from cache/API on first call.
 */
export async function getSharedSchemaStore(client: DimensionsClient): Promise<SchemaStore> {
  if (sharedSchemaStore) {
    return sharedSchemaStore;
  }

  if (!sharedSchemaPromise) {
    sharedSchemaPromise = getOrLoadSchema(client, process.env.SCHEMA_CACHE_PATH).then((store) => {
      sharedSchemaStore = store;
      return store;
    });
  }

  return sharedSchemaPromise;
}

/** Clears the in-memory shared schema (tests). */
export function clearSharedSchemaStore(): void {
  sharedSchemaStore = undefined;
  sharedSchemaPromise = undefined;
}
