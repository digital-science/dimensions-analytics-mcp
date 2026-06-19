/**
 * Tests for time-series return functions (citations_per_year, funding_per_year).
 * @module test/core/time-series
 */

import { describe, expect, it } from "vitest";
import { QueryBuilder } from "../../src/dsl/query-builder.js";

describe("QueryBuilder time-series functions", () => {
  describe("returnCitationsPerYear", () => {
    it("should generate correct DSL for citations_per_year", () => {
      const query = new QueryBuilder()
        .search("publications")
        .for("machine learning")
        .returnCitationsPerYear(2010, 2023)
        .build();

      expect(query).toContain("return citations_per_year(2010, 2023)");
    });

    it("should work with where clauses", () => {
      const query = new QueryBuilder()
        .search("publications")
        .for("test")
        .where("year", ">=", 2020)
        .returnCitationsPerYear(2020, 2024)
        .build();

      expect(query).toContain("where year >= 2020");
      expect(query).toContain("return citations_per_year(2020, 2024)");
    });

    it("should reject endYear before startYear", () => {
      expect(() => {
        new QueryBuilder()
          .search("publications")
          .for("test")
          .returnCitationsPerYear(2024, 2020)
          .build();
      }).toThrow(/startYear must not be greater than endYear/);
    });

    it("should allow same start and end year", () => {
      const query = new QueryBuilder()
        .search("publications")
        .for("test")
        .returnCitationsPerYear(2023, 2023)
        .build();

      expect(query).toContain("return citations_per_year(2023, 2023)");
    });
  });

  describe("returnFundingPerYear", () => {
    it("should generate correct DSL for funding_per_year with default USD", () => {
      const query = new QueryBuilder()
        .search("grants")
        .for("cancer research")
        .returnFundingPerYear(2015, 2023)
        .build();

      expect(query).toContain('return funding_per_year(2015, 2023, "USD")');
    });

    it("should generate correct DSL with specified currency", () => {
      const query = new QueryBuilder()
        .search("grants")
        .for("test")
        .returnFundingPerYear(2015, 2023, "EUR")
        .build();

      expect(query).toContain('return funding_per_year(2015, 2023, "EUR")');
    });

    it("should support all valid currencies", () => {
      const currencies = ["AUD", "CAD", "CHF", "CNY", "EUR", "GBP", "JPY", "NZD", "USD"] as const;

      for (const currency of currencies) {
        const query = new QueryBuilder()
          .search("grants")
          .for("test")
          .returnFundingPerYear(2020, 2024, currency)
          .build();

        expect(query).toContain(`"${currency}"`);
      }
    });

    it("should work with where clauses", () => {
      const query = new QueryBuilder()
        .search("grants")
        .for("test")
        .where("funding_usd", ">", 1000000)
        .returnFundingPerYear(2020, 2024, "GBP")
        .build();

      expect(query).toContain("where funding_usd > 1000000");
      expect(query).toContain('return funding_per_year(2020, 2024, "GBP")');
    });

    it("should reject endYear before startYear", () => {
      expect(() => {
        new QueryBuilder().search("grants").for("test").returnFundingPerYear(2024, 2020).build();
      }).toThrow(/startYear must not be greater than endYear/);
    });
  });

  describe("combining time-series with entity return", () => {
    it("should allow entity return before time-series", () => {
      const query = new QueryBuilder()
        .search("publications")
        .for("test")
        .fields(["id", "title"])
        .limit(10)
        .returnCitationsPerYear(2020, 2024)
        .build();

      expect(query).toContain("return publications[id+title]");
      expect(query).toContain("limit 10");
      expect(query).toContain("return citations_per_year(2020, 2024)");
    });

    it("should allow both citations and funding in same query (grants)", () => {
      const query = new QueryBuilder()
        .search("grants")
        .for("test")
        .returnCitationsPerYear(2020, 2024)
        .returnFundingPerYear(2020, 2024, "USD")
        .build();

      expect(query).toContain("return citations_per_year(2020, 2024)");
      expect(query).toContain('return funding_per_year(2020, 2024, "USD")');
    });
  });
});
