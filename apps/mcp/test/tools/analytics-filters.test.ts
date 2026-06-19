/**
 * @module test/tools/analytics-filters
 */

import { describe, expect, it } from "vitest";
import { DimensionsClient } from "../../src/dsl/index.js";
import { applyAnalyticsFilters } from "../../src/mcp/tools/analytics-filters.js";

describe("applyAnalyticsFilters", () => {
  const client = new DimensionsClient({ apiKey: "test" });

  it("applies yearFrom and yearTo for publications", () => {
    const builder = client.createQueryBuilder().search("publications").for("machine learning");
    applyAnalyticsFilters(builder, "publications", { yearFrom: 2020, yearTo: 2024 });
    const dsl = builder.returnFacet("type", { limit: 10 }).build();
    expect(dsl).toContain("year >= 2020");
    expect(dsl).toContain("year <= 2024");
  });

  it("applies start_year range for grants", () => {
    const builder = client.createQueryBuilder().search("grants").for("cancer");
    applyAnalyticsFilters(builder, "grants", { yearFrom: 2019 });
    const dsl = builder.returnFacet("funders", { limit: 5 }).build();
    expect(dsl).toContain("start_year >= 2019");
  });

  it("applies extended filters", () => {
    const builder = client.createQueryBuilder().search("publications").for("CRISPR");
    applyAnalyticsFilters(builder, "publications", {
      filters: [{ field: "type", operator: "=", value: "article" }],
    });
    const dsl = builder.returnFacet("journal", { limit: 5 }).build();
    expect(dsl).toContain('type = "article"');
  });
});
