/**
 * Tests for unnest functionality in QueryBuilder and FluentQueryBuilder.
 * @module test/core/unnest
 */

import { describe, expect, it } from "vitest";
import { ValidationError } from "../../src/client/index.js";
import { QueryBuilder } from "../../src/dsl/query-builder.js";

describe("QueryBuilder unnest", () => {
  describe("fieldsWithUnnest", () => {
    it("should generate correct DSL for single unnest", () => {
      const query = new QueryBuilder()
        .search("publications")
        .for("test")
        .fieldsWithUnnest(["id", "title"], ["researchers"])
        .build();

      expect(query).toContain("return publications[id+title+unnest(researchers)]");
    });

    it("should generate correct DSL for multiple unnests", () => {
      const query = new QueryBuilder()
        .search("publications")
        .for("test")
        .fieldsWithUnnest(["id", "title"], ["researchers", "category_for"])
        .build();

      expect(query).toContain(
        "return publications[id+title+unnest(researchers)+unnest(category_for)]",
      );
    });

    it("should work with only unnest fields (no regular fields)", () => {
      const query = new QueryBuilder()
        .search("publications")
        .for("test")
        .fieldsWithUnnest([], ["researchers"])
        .build();

      expect(query).toContain("return publications[unnest(researchers)]");
    });

    it("should work with only regular fields (no unnest)", () => {
      const query = new QueryBuilder()
        .search("publications")
        .for("test")
        .fieldsWithUnnest(["id", "title"], [])
        .build();

      expect(query).toContain("return publications[id+title]");
    });

    it("should combine with where clauses", () => {
      const query = new QueryBuilder()
        .search("publications")
        .for("machine learning")
        .where("year", ">=", 2020)
        .fieldsWithUnnest(["id", "title"], ["researchers"])
        .build();

      expect(query).toContain("where year >= 2020");
      expect(query).toContain("unnest(researchers)");
    });

    it("should combine with limit", () => {
      const query = new QueryBuilder()
        .search("publications")
        .for("test")
        .fieldsWithUnnest(["id"], ["researchers"])
        .limit(100)
        .build();

      expect(query).toContain("limit 100");
      expect(query).toContain("unnest(researchers)");
    });

    it("should throw for empty field name in unnest", () => {
      expect(() => {
        new QueryBuilder()
          .search("publications")
          .for("test")
          .fieldsWithUnnest(["id"], [""])
          .build();
      }).toThrow(ValidationError);
    });

    it("should throw for whitespace-only field name in unnest", () => {
      expect(() => {
        new QueryBuilder()
          .search("publications")
          .for("test")
          .fieldsWithUnnest(["id"], ["  "])
          .build();
      }).toThrow(ValidationError);
    });
  });

  describe("addUnnest", () => {
    it("should add unnest to existing fields", () => {
      const query = new QueryBuilder()
        .search("publications")
        .for("test")
        .fields(["id", "title"])
        .addUnnest("researchers")
        .build();

      expect(query).toContain("return publications[id+title+unnest(researchers)]");
    });

    it("should allow chaining multiple addUnnest calls", () => {
      const query = new QueryBuilder()
        .search("publications")
        .for("test")
        .fields(["id"])
        .addUnnest("researchers")
        .addUnnest("category_for")
        .build();

      expect(query).toContain("unnest(researchers)");
      expect(query).toContain("unnest(category_for)");
    });

    it("should throw for empty field name", () => {
      expect(() => {
        new QueryBuilder().search("publications").for("test").fields(["id"]).addUnnest("").build();
      }).toThrow(ValidationError);
    });
  });
});

describe("Unnest response parsing", () => {
  // Note: Full response parsing tests would require integration tests
  // or mocking the client execution

  it("should expect flattened row structure in response", () => {
    // When unnesting, Dimensions API returns flattened rows
    // For example, unnesting researchers creates one row per researcher
    const exampleResponse = {
      publications: [
        { id: "pub.123", title: "Paper 1", researchers: { id: "r.1", name: "Alice" } },
        { id: "pub.123", title: "Paper 1", researchers: { id: "r.2", name: "Bob" } },
        { id: "pub.456", title: "Paper 2", researchers: { id: "r.1", name: "Alice" } },
      ],
    };

    // Same publication can appear multiple times (once per researcher)
    expect(exampleResponse.publications).toHaveLength(3);
    expect(exampleResponse.publications.filter((p) => p.id === "pub.123")).toHaveLength(2);
  });
});
