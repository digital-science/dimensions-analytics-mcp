/**
 * Tests for extended where filters applied via QueryBuilder.
 * @module test/commands/search/filters
 */

import { describe, expect, it } from "vitest";
import { applyFilters } from "../../../../src/dsl/commands/apply-filters.js";
import { QueryBuilder } from "../../../../src/dsl/query-builder.js";

describe("QueryBuilder extended filters", () => {
  it("includes equality filter in DSL", () => {
    const builder = new QueryBuilder().search("publications").for("AI");
    applyFilters(builder, [{ field: "open_access", operator: "=", value: true }]);
    expect(builder.build()).toContain("open_access");
  });

  it("includes numeric comparison filter", () => {
    const builder = new QueryBuilder().search("publications").for("AI");
    applyFilters(builder, [{ field: "times_cited", operator: ">=", value: 100 }]);
    expect(builder.build()).toContain("times_cited >=");
  });

  it("includes in-clause filter", () => {
    const builder = new QueryBuilder().search("publications").for("genomics");
    applyFilters(builder, [{ field: "type", operator: "in", value: ["article", "preprint"] }]);
    expect(builder.build()).toContain("type in");
  });

  it("includes is_empty filter", () => {
    const builder = new QueryBuilder().search("publications").for("genomics");
    applyFilters(builder, [{ field: "doi", operator: "is_empty" }]);
    expect(builder.build()).toContain("doi is empty");
  });

  it("combines year convenience filters with extended filters", () => {
    const builder = new QueryBuilder().search("publications").for("AI").where("year", ">=", 2020);
    applyFilters(builder, [{ field: "times_cited", operator: ">=", value: 100 }]);
    const dsl = builder.build();
    expect(dsl).toContain("year >=");
    expect(dsl).toContain("times_cited >=");
  });
});
