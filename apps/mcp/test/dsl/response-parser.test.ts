import { describe, expect, it } from "vitest";
import { ValidationError } from "../../src/client/index.js";
import { parseEntityResponse, parseFacetResponse } from "../../src/dsl/response-parser.js";

describe("parseFacetResponse", () => {
  describe("successful parsing", () => {
    it("parses facets only response", () => {
      const response = {
        year: [
          { id: 2023, count: 100 },
          { id: 2022, count: 80 },
        ],
        type: [
          { id: "article", count: 150 },
          { id: "review", count: 30 },
        ],
      };

      const result = parseFacetResponse(response, "publications", ["year", "type"]);

      expect(result.entities).toBeUndefined();
      expect(result.facets.year.field).toBe("year");
      expect(result.facets.year.buckets).toHaveLength(2);
      expect(result.facets.year.buckets[0]).toEqual({ id: 2023, count: 100 });
      expect(result.facets.type.field).toBe("type");
      expect(result.facets.type.buckets).toHaveLength(2);
      expect(result._raw).toBe(response);
    });

    it("parses entities with facets", () => {
      const response = {
        publications: [
          { id: "pub1", title: "Test Publication 1" },
          { id: "pub2", title: "Test Publication 2" },
        ],
        _stats: { total_count: 100 },
        year: [{ id: 2023, count: 50 }],
      };

      const result = parseFacetResponse(response, "publications", ["year"]);

      expect(result.entities).toBeDefined();
      expect(result.entities!.data).toHaveLength(2);
      expect(result.entities!.totalCount).toBe(100);
      expect(result.facets.year.buckets).toHaveLength(1);
    });

    it("handles empty bucket arrays", () => {
      const response = {
        year: [],
      };

      const result = parseFacetResponse(response, "publications", ["year"]);

      expect(result.facets.year.field).toBe("year");
      expect(result.facets.year.buckets).toHaveLength(0);
    });

    it("preserves raw response", () => {
      const response = {
        year: [{ id: 2023, count: 10 }],
        _extra_field: "some data",
      };

      const result = parseFacetResponse(response, "publications", ["year"]);

      expect(result._raw).toBe(response);
      expect(result._raw._extra_field).toBe("some data");
    });

    it("handles empty entity array without requiring stats", () => {
      const response = {
        publications: [],
        year: [{ id: 2023, count: 10 }],
      };

      const result = parseFacetResponse(response, "publications", ["year"]);

      expect(result.entities).toBeDefined();
      expect(result.entities!.data).toHaveLength(0);
      expect(result.entities!.totalCount).toBe(0);
    });

    it("handles buckets with extra fields", () => {
      const response = {
        funders: [
          { id: "f1", count: 50, name: "NIH", acronym: "NIH", country_name: "USA" },
          { id: "f2", count: 30, name: "NSF", acronym: "NSF" },
        ],
      };

      const result = parseFacetResponse(response, "publications", ["funders"]);

      expect(result.facets.funders.buckets[0]).toHaveProperty("name", "NIH");
      expect(result.facets.funders.buckets[0]).toHaveProperty("acronym", "NIH");
    });
  });

  describe("entity validation", () => {
    it("throws when _stats.total_count missing for non-empty entities", () => {
      const response = {
        publications: [{ id: "pub1", title: "Test" }],
        year: [{ id: 2023, count: 10 }],
      };

      expect(() => parseFacetResponse(response, "publications", ["year"])).toThrow(ValidationError);

      try {
        parseFacetResponse(response, "publications", ["year"]);
      } catch (e) {
        expect(e).toBeInstanceOf(ValidationError);
        expect((e as ValidationError).message).toContain("missing _stats.total_count");
      }
    });

    it("throws when entity key is not an array", () => {
      const response = {
        publications: { id: "pub1" }, // object instead of array
        _stats: { total_count: 1 },
        year: [{ id: 2023, count: 10 }],
      };

      expect(() => parseFacetResponse(response, "publications", ["year"])).toThrow(ValidationError);

      try {
        parseFacetResponse(response, "publications", ["year"]);
      } catch (e) {
        expect(e).toBeInstanceOf(ValidationError);
        expect((e as ValidationError).message).toContain("must be an array");
        expect((e as ValidationError).details?.entityKey).toBe("publications");
      }
    });

    it("throws when _stats.total_count is invalid type", () => {
      const response = {
        publications: [{ id: "pub1" }],
        _stats: { total_count: "not a number" },
        year: [{ id: 2023, count: 10 }],
      };

      expect(() => parseFacetResponse(response, "publications", ["year"])).toThrow(ValidationError);
    });

    it("throws when _stats.total_count is negative", () => {
      const response = {
        publications: [{ id: "pub1" }],
        _stats: { total_count: -1 },
        year: [{ id: 2023, count: 10 }],
      };

      expect(() => parseFacetResponse(response, "publications", ["year"])).toThrow(ValidationError);
    });
  });

  describe("facet validation", () => {
    it("throws when requested facet field is missing", () => {
      const response = {
        year: [{ id: 2023, count: 10 }],
        // 'type' is missing
      };

      expect(() => parseFacetResponse(response, "publications", ["year", "type"])).toThrow(
        ValidationError,
      );

      try {
        parseFacetResponse(response, "publications", ["year", "type"]);
      } catch (e) {
        expect(e).toBeInstanceOf(ValidationError);
        expect((e as ValidationError).message).toContain('Missing facet field "type"');
        expect((e as ValidationError).details?.requestedFields).toContain("type");
      }
    });

    it("throws when facet field is not an array", () => {
      const response = {
        year: { id: 2023, count: 10 }, // object instead of array
      };

      expect(() => parseFacetResponse(response, "publications", ["year"])).toThrow(ValidationError);

      try {
        parseFacetResponse(response, "publications", ["year"]);
      } catch (e) {
        expect(e).toBeInstanceOf(ValidationError);
        expect((e as ValidationError).message).toContain('Facet field "year" must be an array');
      }
    });

    it("throws when bucket is missing id", () => {
      const response = {
        year: [{ count: 10 }], // missing id
      };

      expect(() => parseFacetResponse(response, "publications", ["year"])).toThrow(ValidationError);

      try {
        parseFacetResponse(response, "publications", ["year"]);
      } catch (e) {
        expect(e).toBeInstanceOf(ValidationError);
        expect((e as ValidationError).message).toContain("Invalid bucket data");
      }
    });

    it("throws when bucket is missing count", () => {
      const response = {
        year: [{ id: 2023 }], // missing count
      };

      expect(() => parseFacetResponse(response, "publications", ["year"])).toThrow(ValidationError);
    });

    it("throws when bucket count is negative", () => {
      const response = {
        year: [{ id: 2023, count: -5 }],
      };

      expect(() => parseFacetResponse(response, "publications", ["year"])).toThrow(ValidationError);
    });

    it("throws when bucket count is not an integer", () => {
      const response = {
        year: [{ id: 2023, count: 10.5 }],
      };

      expect(() => parseFacetResponse(response, "publications", ["year"])).toThrow(ValidationError);
    });

    it("throws when bucket id is null", () => {
      const response = {
        year: [{ id: null, count: 10 }],
      };

      expect(() => parseFacetResponse(response, "publications", ["year"])).toThrow(ValidationError);
    });
  });

  describe("aggregation validation", () => {
    it("validates indicator is present in bucket", () => {
      const response = {
        funders: [
          { id: "f1", count: 50 }, // missing rcr_avg
        ],
      };

      expect(() =>
        parseFacetResponse(response, "publications", {
          funders: { indicators: ["rcr_avg"] },
        }),
      ).toThrow(ValidationError);
    });

    it("validates indicator is a number", () => {
      const response = {
        funders: [{ id: "f1", count: 50, rcr_avg: "not a number" }],
      };

      expect(() =>
        parseFacetResponse(response, "publications", {
          funders: { indicators: ["rcr_avg"] },
        }),
      ).toThrow(ValidationError);
    });

    it("validates all indicators are present", () => {
      const response = {
        funders: [
          { id: "f1", count: 50, rcr_avg: 1.5 }, // missing citations_avg
        ],
      };

      expect(() =>
        parseFacetResponse(response, "publications", {
          funders: { indicators: ["rcr_avg", "citations_avg"] },
        }),
      ).toThrow(ValidationError);
    });

    it("passes when all indicators are valid numbers", () => {
      const response = {
        funders: [
          { id: "f1", count: 50, rcr_avg: 1.5, citations_avg: 42.3 },
          { id: "f2", count: 30, rcr_avg: 2.1, citations_avg: 15.0 },
        ],
      };

      const result = parseFacetResponse(response, "publications", {
        funders: { indicators: ["rcr_avg", "citations_avg"] },
      });

      expect(result.facets.funders.buckets).toHaveLength(2);
      expect(result.facets.funders.buckets[0].rcr_avg).toBe(1.5);
    });

    it("handles mixed facets with and without indicators", () => {
      const response = {
        year: [{ id: 2023, count: 100 }],
        funders: [{ id: "f1", count: 50, rcr_avg: 1.5 }],
      };

      const result = parseFacetResponse(response, "publications", {
        year: {},
        funders: { indicators: ["rcr_avg"] },
      });

      expect(result.facets.year.buckets).toHaveLength(1);
      expect(result.facets.funders.buckets).toHaveLength(1);
    });

    it("includes indicator names in error details", () => {
      const response = {
        funders: [{ id: "f1", count: 50 }],
      };

      try {
        parseFacetResponse(response, "publications", {
          funders: { indicators: ["rcr_avg", "funding"] },
        });
      } catch (e) {
        expect(e).toBeInstanceOf(ValidationError);
        expect((e as ValidationError).details?.indicators).toEqual(["rcr_avg", "funding"]);
      }
    });
  });

  describe("includeRaw option", () => {
    it("includes raw response by default", () => {
      const response = {
        year: [{ id: 2023, count: 100 }],
      };

      const result = parseFacetResponse(response, "publications", ["year"]);

      expect(result._raw).toBe(response);
    });

    it("includes raw response when includeRaw is true", () => {
      const response = {
        year: [{ id: 2023, count: 100 }],
      };

      const result = parseFacetResponse(response, "publications", ["year"], {
        includeRaw: true,
      });

      expect(result._raw).toBe(response);
    });

    it("excludes raw response when includeRaw is false", () => {
      const response = {
        year: [{ id: 2023, count: 100 }],
      };

      const result = parseFacetResponse(response, "publications", ["year"], {
        includeRaw: false,
      });

      expect(result._raw).toBeUndefined();
    });

    it("excludes raw response with entities when includeRaw is false", () => {
      const response = {
        publications: [{ id: "pub1", title: "Test" }],
        _stats: { total_count: 1 },
        year: [{ id: 2023, count: 100 }],
      };

      const result = parseFacetResponse(response, "publications", ["year"], {
        includeRaw: false,
      });

      expect(result._raw).toBeUndefined();
      expect(result.entities).toBeDefined();
      expect(result.facets.year).toBeDefined();
    });
  });

  describe("edge cases", () => {
    it("handles empty facetFields array", () => {
      const response = {
        year: [{ id: 2023, count: 10 }],
      };

      const result = parseFacetResponse(response, "publications", []);

      expect(result.facets).toEqual({});
      expect(result.entities).toBeUndefined();
    });

    it("handles response with extra fields not in facetFields", () => {
      const response = {
        year: [{ id: 2023, count: 10 }],
        type: [{ id: "article", count: 5 }],
        extra_field: [{ id: "x", count: 1 }],
      };

      const result = parseFacetResponse(response, "publications", ["year"]);

      expect(Object.keys(result.facets)).toEqual(["year"]);
      expect(result.facets.type).toBeUndefined();
    });

    it("handles bucket with id as number", () => {
      const response = {
        year: [{ id: 2023, count: 10 }],
      };

      const result = parseFacetResponse(response, "publications", ["year"]);

      expect(result.facets.year.buckets[0].id).toBe(2023);
    });

    it("handles bucket with id as string", () => {
      const response = {
        type: [{ id: "article", count: 10 }],
      };

      const result = parseFacetResponse(response, "publications", ["type"]);

      expect(result.facets.type.buckets[0].id).toBe("article");
    });

    it("handles bucket with count of zero", () => {
      const response = {
        year: [{ id: 2023, count: 0 }],
      };

      const result = parseFacetResponse(response, "publications", ["year"]);

      expect(result.facets.year.buckets[0].count).toBe(0);
    });
  });
});

describe("parseEntityResponse", () => {
  describe("successful parsing", () => {
    it("parses entity array with stats", () => {
      const response = {
        publications: [
          { id: "pub1", title: "Test 1" },
          { id: "pub2", title: "Test 2" },
        ],
        _stats: { total_count: 100 },
      };

      const result = parseEntityResponse(response, "publications");

      expect(result.data).toHaveLength(2);
      expect(result.totalCount).toBe(100);
    });

    it("returns empty result when entity key missing", () => {
      const response = {
        _stats: { total_count: 0 },
      };

      const result = parseEntityResponse(response, "publications");

      expect(result.data).toHaveLength(0);
      expect(result.totalCount).toBe(0);
    });

    it("returns empty result for empty array", () => {
      const response = {
        publications: [],
      };

      const result = parseEntityResponse(response, "publications");

      expect(result.data).toHaveLength(0);
      expect(result.totalCount).toBe(0);
    });
  });

  describe("validation errors", () => {
    it("throws when entity key is not an array", () => {
      const response = {
        publications: { id: "pub1" }, // object instead of array
        _stats: { total_count: 1 },
      };

      expect(() => parseEntityResponse(response, "publications")).toThrow(ValidationError);
    });

    it("falls back to data.length when _stats.total_count missing", () => {
      const response = {
        publications: [{ id: "pub1" }, { id: "pub2" }],
        // missing _stats
      };

      const result = parseEntityResponse(response, "publications");

      expect(result.data).toHaveLength(2);
      expect(result.totalCount).toBe(2);
    });

    it("falls back to data.length when _stats.total_count is invalid", () => {
      const response = {
        publications: [{ id: "pub1" }],
        _stats: { total_count: "not a number" },
      };

      const result = parseEntityResponse(response, "publications");

      expect(result.data).toHaveLength(1);
      expect(result.totalCount).toBe(1);
    });

    it("falls back to data.length when _stats.total_count is negative", () => {
      const response = {
        publications: [{ id: "pub1" }],
        _stats: { total_count: -1 },
      };

      const result = parseEntityResponse(response, "publications");

      expect(result.totalCount).toBe(1);
    });
  });
});
