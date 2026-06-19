/**
 * @module test/schema/summary
 */

import { describe, expect, it } from "vitest";
import { createSchemaStoreFromResponse } from "../../../src/dsl/schema/store.js";
import { buildSchemaSummary, SCHEMA_RESOURCE_URIS } from "../../../src/dsl/schema/summary.js";

const sample = {
  sources: {
    publications: {
      fields: {
        year: { type: "int", is_filter: true, is_facet: true },
        title: { type: "string", is_filter: true },
      },
      search_fields: ["full_data", "title"],
      metrics: ["times_cited"],
      fieldsets: { basic: ["id", "title"] },
    },
  },
  entities: { journals: { fields: { title: { type: "string", is_filter: true } } } },
};

describe("buildSchemaSummary", () => {
  it("returns compact counts and resource URIs", () => {
    const store = createSchemaStoreFromResponse(
      sample,
      "2.15.0",
      new Date("2026-01-01T00:00:00Z"),
      {
        loadSource: "api",
        stale: false,
      },
    );
    const summary = buildSchemaSummary(store);

    expect(summary.version).toBe("2.15.0");
    expect(summary.stats.sourceCount).toBe(1);
    expect(summary.stats.entityCount).toBe(1);
    expect(summary.sources.publications.filterableFieldCount).toBe(2);
    expect(summary.sources.publications.facetFieldCount).toBe(1);
    expect(summary.sources.publications.searchIndexCount).toBe(2);
    expect(summary.sources.publications.metricCount).toBe(1);
    expect(summary.resources).toEqual(SCHEMA_RESOURCE_URIS);
    expect(summary.hint).toContain("dimensions://fields");
  });

  it("marks stale cache in the hint", () => {
    const store = createSchemaStoreFromResponse(sample, "2.15.0", new Date(), {
      loadSource: "cache",
      stale: true,
      cachedAt: new Date("2026-01-01T00:00:00Z"),
    });
    const summary = buildSchemaSummary(store);

    expect(summary.stale).toBe(true);
    expect(summary.loadSource).toBe("cache");
    expect(summary.cachedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(summary.hint).toContain("refresh_schema");
  });
});
