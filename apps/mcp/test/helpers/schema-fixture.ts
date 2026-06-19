/**
 * Test helper providing a pre-loaded {@link SchemaStore} from fixture data.
 * @module test/helpers/schema-fixture
 */

import {
  createSchemaStoreFromResponse,
  type DescribeSchemaResponse,
} from "../../src/mcp/schema/index.js";
import fixture from "../fixtures/describe-schema.json";

/**
 * Returns a schema store built from the committed describe fixture.
 * @returns Schema store for unit tests
 */
export function testSchemaStore() {
  return createSchemaStoreFromResponse(fixture as DescribeSchemaResponse, "2.15.0");
}
