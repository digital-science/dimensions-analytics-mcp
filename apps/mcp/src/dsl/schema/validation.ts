/**
 * Runtime validation helpers using {@link SchemaStore} when available.
 * @module schema/validation
 */

import { ValidationError } from "../../client/index.js";
import type { EntityType, SearchIndex } from "../types/vocabulary.js";
import { VALID_ENTITIES, VALID_INDEXES } from "../types/vocabulary.js";
import type { SchemaStore } from "./store.js";

/**
 * Validates a Dimensions source/entity name.
 * @param schemaStore - Optional loaded describe schema
 * @param entity - Source name (e.g. `publications`)
 * @throws {ValidationError} When the source is unknown
 */
export function assertValidEntity(schemaStore: SchemaStore | undefined, entity: string): void {
  if (schemaStore) {
    if (!schemaStore.getSource(entity)) {
      const known = schemaStore.sourceNames().join(", ");
      throw new ValidationError(
        `Unknown source: ${entity}${known ? `. Known sources: ${known}` : ""}`,
      );
    }
    return;
  }
  if (!VALID_ENTITIES.includes(entity as EntityType)) {
    throw new ValidationError(`Invalid entity type: ${entity}`);
  }
}

/**
 * Validates a search index for the current source.
 * @param schemaStore - Optional loaded describe schema
 * @param entity - Active source from {@link QueryBuilder.search}, if set
 * @param index - Search index name
 * @throws {ValidationError} When the index is unknown
 */
export function assertValidSearchIndex(
  schemaStore: SchemaStore | undefined,
  entity: string | null,
  index: string,
): void {
  if (schemaStore && entity) {
    const indexes = schemaStore.searchIndexes(entity);
    if (indexes.length > 0 && !indexes.includes(index)) {
      throw new ValidationError(
        `Invalid search index "${index}" for ${entity}. Valid indexes: ${indexes.join(", ")}`,
      );
    }
    return;
  }
  if (!VALID_INDEXES.includes(index as SearchIndex)) {
    throw new ValidationError(`Invalid search index: ${index}`);
  }
}
