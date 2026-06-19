/**
 * Tests for {@link SchemaStore} parsing and derived views.
 * @module test/schema/store
 */

import { describe, expect, it } from "vitest";
import { createSchemaStoreFromResponse, type DescribeSchemaResponse } from "../../src/dsl/index.js";
import fixture from "../fixtures/describe-schema.json";

describe("SchemaStore", () => {
  const store = createSchemaStoreFromResponse(fixture as DescribeSchemaResponse, "2.15.0");

  it("loads sources and entities from fixture", () => {
    expect(store.sourceNames().length).toBeGreaterThan(8);
    expect(store.entityNames().length).toBeGreaterThan(0);
    expect(store.version).toBe("2.15.0");
  });

  it("derives filterable fields for publications", () => {
    const fields = store.filterableFields("publications");
    expect(fields).toContain("year");
    expect(fields.length).toBeGreaterThan(20);
  });

  it("derives facet fields for grants", () => {
    const facets = store.facetFields("grants");
    expect(facets.length).toBeGreaterThan(0);
  });

  it("exposes search indexes for publications", () => {
    const indexes = store.searchIndexes("publications");
    expect(indexes.length).toBeGreaterThan(0);
  });

  it("exposes metrics for grants", () => {
    const metrics = store.metrics("grants");
    expect(metrics.length).toBeGreaterThan(0);
  });

  it("structuredEntityTypes intersects structured entity list with loaded sources", () => {
    const types = store.structuredEntityTypes();
    expect(types).toContain("publications");
    expect(types).toContain("organizations");
  });
});
