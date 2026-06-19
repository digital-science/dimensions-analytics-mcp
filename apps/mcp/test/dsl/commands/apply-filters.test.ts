/**
 * Tests for the applyFilters helper.
 * @module test/commands/apply-filters
 */

import { describe, expect, it } from "vitest";
import { applyFilters } from "../../../src/dsl/commands/apply-filters.js";
import type { ExtendedWhereFilterInput } from "../../../src/dsl/commands/facet/schemas.js";
import { ExtendedWhereFilterSchema } from "../../../src/dsl/commands/facet/schemas.js";
import { QueryBuilder } from "../../../src/dsl/query-builder.js";

describe("applyFilters", () => {
  function buildWith(filters: readonly ExtendedWhereFilterInput[]): string {
    const builder = new QueryBuilder().search("publications");
    applyFilters(builder, filters);
    return builder.build();
  }

  describe("scalar comparisons", () => {
    it("applies numeric >= filter", () => {
      const dsl = buildWith([{ field: "year", operator: ">=", value: 2020 }]);
      expect(dsl).toContain("year >= 2020");
    });

    it("applies string = filter", () => {
      const dsl = buildWith([{ field: "type", operator: "=", value: "article" }]);
      expect(dsl).toContain('type = "article"');
    });

    it("applies boolean = filter", () => {
      const dsl = buildWith([{ field: "open_access", operator: "=", value: true }]);
      expect(dsl).toContain("open_access = true");
    });

    it("applies != operator", () => {
      const dsl = buildWith([{ field: "type", operator: "!=", value: "preprint" }]);
      expect(dsl).toContain('type != "preprint"');
    });

    it("applies > operator", () => {
      const dsl = buildWith([{ field: "times_cited", operator: ">", value: 50 }]);
      expect(dsl).toContain("times_cited > 50");
    });

    it("applies < operator", () => {
      const dsl = buildWith([{ field: "year", operator: "<", value: 2024 }]);
      expect(dsl).toContain("year < 2024");
    });

    it("applies <= operator", () => {
      const dsl = buildWith([{ field: "year", operator: "<=", value: 2023 }]);
      expect(dsl).toContain("year <= 2023");
    });
  });

  describe("in operator", () => {
    it("applies in filter with string array", () => {
      const filter: ExtendedWhereFilterInput = {
        field: "type",
        operator: "in",
        value: ["article", "preprint"],
      };
      const dsl = buildWith([filter]);
      expect(dsl).toContain('type in ["article", "preprint"]');
    });

    it("applies in filter with number array", () => {
      const filter: ExtendedWhereFilterInput = {
        field: "year",
        operator: "in",
        value: [2020, 2021, 2022],
      };
      const dsl = buildWith([filter]);
      expect(dsl).toContain("year in [2020, 2021, 2022]");
    });

    it("coerces scalar string to single-element array via schema parse", () => {
      // The coercion from scalar → array happens at Zod parse time.
      const parsed = ExtendedWhereFilterSchema.parse({
        field: "type",
        operator: "in",
        value: "article",
      }) as ExtendedWhereFilterInput;
      const dsl = buildWith([parsed]);
      expect(dsl).toContain('type in ["article"]');
    });

    it("coerces scalar number to single-element array via schema parse", () => {
      const parsed = ExtendedWhereFilterSchema.parse({
        field: "year",
        operator: "in",
        value: 2022,
      }) as ExtendedWhereFilterInput;
      const dsl = buildWith([parsed]);
      expect(dsl).toContain("year in [2022]");
    });
  });

  describe("emptiness operators", () => {
    it("applies is_empty filter", () => {
      const filter: ExtendedWhereFilterInput = { field: "doi", operator: "is_empty" };
      const dsl = buildWith([filter]);
      expect(dsl).toContain("doi is empty");
    });

    it("applies is_not_empty filter", () => {
      const filter: ExtendedWhereFilterInput = { field: "doi", operator: "is_not_empty" };
      const dsl = buildWith([filter]);
      expect(dsl).toContain("doi is not empty");
    });
  });

  describe("multiple filters", () => {
    it("applies all filters and joins them with and", () => {
      const filters: ExtendedWhereFilterInput[] = [
        { field: "year", operator: ">=", value: 2020 },
        { field: "type", operator: "=", value: "article" },
        { field: "open_access", operator: "=", value: true },
      ];
      const dsl = buildWith(filters);
      expect(dsl).toContain("year >= 2020");
      expect(dsl).toContain('type = "article"');
      expect(dsl).toContain("open_access = true");
      // All three appear in a single where clause joined by "and"
      expect(dsl).toContain('where year >= 2020 and type = "article" and open_access = true');
    });

    it("applies mixed operator types together", () => {
      const filters: ExtendedWhereFilterInput[] = [
        { field: "times_cited", operator: ">=", value: 100 },
        { field: "type", operator: "in", value: ["article", "preprint"] },
        { field: "doi", operator: "is_not_empty" },
      ];
      const dsl = buildWith(filters);
      expect(dsl).toContain("times_cited >= 100");
      expect(dsl).toContain('type in ["article", "preprint"]');
      expect(dsl).toContain("doi is not empty");
    });
  });

  describe("empty input", () => {
    it("does not add a where clause when filters array is empty", () => {
      const dsl = buildWith([]);
      expect(dsl).not.toContain("where");
    });
  });
});
