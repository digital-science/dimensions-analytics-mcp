/**
 * Tests for describe-backed validation helpers.
 * @module test/schema/validation
 */

import { describe, expect, it } from "vitest";
import { ValidationError } from "../../../src/client/index.js";
import {
  assertValidEntity,
  assertValidSearchIndex,
  createSchemaStoreFromResponse,
  type DescribeSchemaResponse,
  QueryBuilder,
} from "../../../src/dsl/index.js";
import fixture from "../../fixtures/describe-schema.json";

describe("schema validation", () => {
  const store = createSchemaStoreFromResponse(fixture as DescribeSchemaResponse);

  it("assertValidEntity accepts sources from describe", () => {
    expect(() => assertValidEntity(store, "publications")).not.toThrow();
  });

  it("assertValidEntity rejects unknown sources when store is set", () => {
    expect(() => assertValidEntity(store, "not_a_source")).toThrow(ValidationError);
  });

  it("assertValidSearchIndex accepts indexes from describe", () => {
    expect(() => assertValidSearchIndex(store, "publications", "full_data")).not.toThrow();
  });

  it("assertValidSearchIndex rejects unknown indexes when store is set", () => {
    expect(() => assertValidSearchIndex(store, "publications", "not_an_index")).toThrow(
      ValidationError,
    );
  });

  it("QueryBuilder uses schema store when provided", () => {
    expect(() => new QueryBuilder(store).search("not_a_source")).toThrow(ValidationError);
    expect(() =>
      new QueryBuilder(store).search("publications").in("not_an_index").for("test"),
    ).toThrow(ValidationError);
    const dsl = new QueryBuilder(store).search("publications").for("test").limit(1).build();
    expect(dsl).toContain('search publications for "test"');
  });
});
