/**
 * Integration test helpers for structured search via QueryBuilder.
 * @module test/integration/search-helpers
 */

import type { DimensionsClient } from "../../../../src/dsl/client.js";
import { QueryBuilder } from "../../../../src/dsl/query-builder.js";
import type { EntityResult } from "../../../../src/dsl/response-parser.js";
import { parseEntityResponse } from "../../../../src/dsl/response-parser.js";
import type { EntityType } from "../../../../src/dsl/types/vocabulary.js";

/**
 * Runs a search query built with QueryBuilder and parses entity results.
 * @param client - Dimensions client
 * @param entity - Source entity type
 * @param configure - Builds the query from a fresh builder (already scoped to `entity`)
 * @returns Parsed entity rows and total count
 */
export async function runSearch<T>(
  client: DimensionsClient,
  entity: EntityType,
  configure: (builder: QueryBuilder) => QueryBuilder,
): Promise<EntityResult<T>> {
  const dsl = configure(new QueryBuilder().search(entity)).build();
  const response = (await client.rawQuery(dsl)) as Record<string, unknown>;
  return parseEntityResponse<T>(response, entity);
}
