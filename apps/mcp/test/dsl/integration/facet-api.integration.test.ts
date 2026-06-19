/**
 * Integration tests for Facet API.
 * Tests facet and aggregation functionality against the real Dimensions API.
 * @module test/integration/facet-api.integration
 */

import { beforeAll, describe, expect, it } from "vitest";
import { DimensionsClient } from "../../../../src/dsl/index.js";

import { loadTestConfig } from "./test-config.js";

const config = loadTestConfig(); // was: process.env.DIMENSIONS_API_KEY
const TIMEOUT = 30_000;

describe.skipIf(!config)("Facet API Integration", () => {
  let client: DimensionsClient;

  beforeAll(() => {
    client = new DimensionsClient({
      apiKey: config!.apiKey,
      ...(config!.baseUrl && { baseUrl: config!.baseUrl }),
      rateLimitPerMinute: 30,
    });
  });

  describe("publications facets", () => {
    it(
      "returns year facet buckets with valid structure",
      async () => {
        const result = await client
          .publications()
          .for("CRISPR")
          .withFacet("year")
          .executeWithFacets();

        expect(result.facets.year).toBeDefined();
        expect(result.facets.year.buckets.length).toBeGreaterThan(0);
        expect(result.facets.year.field).toBe("year");

        // Contract: bucket must have id (number) and count (non-negative integer)
        for (const bucket of result.facets.year.buckets) {
          expect(typeof bucket.id).toBe("number");
          expect(typeof bucket.count).toBe("number");
          expect(Number.isInteger(bucket.count)).toBe(true);
          expect(bucket.count).toBeGreaterThanOrEqual(0);
        }
      },
      TIMEOUT,
    );

    it(
      "returns year facet with limit",
      async () => {
        const result = await client
          .publications()
          .for("machine learning")
          .withFacet("year", { limit: 5 })
          .executeWithFacets();

        expect(result.facets.year.buckets.length).toBeLessThanOrEqual(5);
      },
      TIMEOUT,
    );

    it(
      "returns funders facet buckets with valid structure",
      async () => {
        const result = await client
          .publications()
          .for("cancer research")
          .withFacet("funders", { limit: 10 })
          .executeWithFacets();

        expect(result.facets.funders).toBeDefined();
        expect(result.facets.funders.buckets.length).toBeGreaterThan(0);

        // Contract: entity ref bucket must have id (string), count, and name
        for (const bucket of result.facets.funders.buckets) {
          expect(typeof bucket.id).toBe("string");
          expect(typeof bucket.count).toBe("number");
          expect(Number.isInteger(bucket.count)).toBe(true);
          expect(bucket.count).toBeGreaterThanOrEqual(0);
          // Entity ref buckets have additional metadata
          expect(bucket).toHaveProperty("name");
        }
      },
      TIMEOUT,
    );

    it(
      "returns multiple facets",
      async () => {
        const result = await client
          .publications()
          .for("genomics")
          .withFacet("year")
          .withFacet("type")
          .executeWithFacets();

        expect(result.facets.year).toBeDefined();
        expect(result.facets.type).toBeDefined();
        expect(result.facets.year.buckets.length).toBeGreaterThan(0);
        expect(result.facets.type.buckets.length).toBeGreaterThan(0);
      },
      TIMEOUT,
    );

    it(
      "returns aggregated facet with rcr_avg and valid structure",
      async () => {
        const result = await client
          .publications()
          .for("CRISPR")
          .withAggregate("funders", ["rcr_avg"], {
            sortBy: "rcr_avg",
            sortOrder: "desc",
            limit: 10,
          })
          .executeWithFacets();

        expect(result.facets.funders).toBeDefined();
        expect(result.facets.funders.buckets.length).toBeGreaterThan(0);

        // Contract: aggregated bucket must have base fields + indicator
        for (const bucket of result.facets.funders.buckets) {
          expect(typeof bucket.id).toBe("string");
          expect(typeof bucket.count).toBe("number");
          expect(Number.isInteger(bucket.count)).toBe(true);
          expect(bucket).toHaveProperty("rcr_avg");
          expect(typeof bucket.rcr_avg).toBe("number");
        }
      },
      TIMEOUT,
    );

    it(
      "returns aggregated facet with multiple indicators and valid structure",
      async () => {
        const result = await client
          .publications()
          .for("machine learning")
          .withAggregate("research_orgs", ["rcr_avg", "citations_avg"], {
            sortBy: "citations_avg",
            sortOrder: "desc",
            limit: 5,
          })
          .executeWithFacets();

        expect(result.facets.research_orgs).toBeDefined();
        expect(result.facets.research_orgs.buckets.length).toBeGreaterThan(0);

        // Contract: all requested indicators must be present as numbers
        for (const bucket of result.facets.research_orgs.buckets) {
          expect(typeof bucket.id).toBe("string");
          expect(typeof bucket.count).toBe("number");
          expect(bucket).toHaveProperty("rcr_avg");
          expect(bucket).toHaveProperty("citations_avg");
          expect(typeof bucket.rcr_avg).toBe("number");
          expect(typeof bucket.citations_avg).toBe("number");
        }
      },
      TIMEOUT,
    );

    it(
      "combines entities with facets and validates structure",
      async () => {
        const result = await client
          .publications()
          .for("COVID-19")
          .fields(["id", "title", "year"])
          .limit(10)
          .withFacet("year")
          .executeWithFacets();

        // Contract: entities must have data array and totalCount
        expect(result.entities).toBeDefined();
        expect(Array.isArray(result.entities!.data)).toBe(true);
        expect(result.entities!.data.length).toBeGreaterThan(0);
        expect(typeof result.entities!.totalCount).toBe("number");
        expect(result.entities!.totalCount).toBeGreaterThan(0);

        // Contract: facets must still be valid
        expect(result.facets.year).toBeDefined();
        expect(result.facets.year.buckets.length).toBeGreaterThan(0);
        for (const bucket of result.facets.year.buckets) {
          expect(typeof bucket.id).toBe("number");
          expect(typeof bucket.count).toBe("number");
        }
      },
      TIMEOUT,
    );

    it(
      "preserves raw response",
      async () => {
        const result = await client
          .publications()
          .for("CRISPR")
          .withFacet("year")
          .executeWithFacets();

        expect(result._raw).toBeDefined();
        expect(result._raw.year).toBeDefined();
      },
      TIMEOUT,
    );
  });

  describe("grants facets", () => {
    it(
      "returns start_year facet buckets with valid structure",
      async () => {
        const result = await client
          .grants()
          .for("cancer research")
          .withFacet("start_year")
          .executeWithFacets();

        expect(result.facets.start_year).toBeDefined();
        expect(result.facets.start_year.buckets.length).toBeGreaterThan(0);

        // Contract: year bucket must have numeric id and integer count
        for (const bucket of result.facets.start_year.buckets) {
          expect(typeof bucket.id).toBe("number");
          expect(typeof bucket.count).toBe("number");
          expect(Number.isInteger(bucket.count)).toBe(true);
          expect(bucket.count).toBeGreaterThanOrEqual(0);
        }
      },
      TIMEOUT,
    );

    it(
      "returns funders with funding aggregation and valid structure",
      async () => {
        const result = await client
          .grants()
          .for("renewable energy")
          .withAggregate("funders", ["funding"], {
            sortBy: "funding",
            sortOrder: "desc",
            limit: 10,
          })
          .executeWithFacets();

        expect(result.facets.funders).toBeDefined();
        expect(result.facets.funders.buckets.length).toBeGreaterThan(0);

        // Contract: funding aggregation must be a number
        for (const bucket of result.facets.funders.buckets) {
          expect(typeof bucket.id).toBe("string");
          expect(typeof bucket.count).toBe("number");
          expect(bucket).toHaveProperty("funding");
          expect(typeof bucket.funding).toBe("number");
        }
      },
      TIMEOUT,
    );
  });

  describe("getDsl with facets", () => {
    it("returns DSL string without executing", () => {
      const dsl = client
        .publications()
        .for("CRISPR")
        .withFacet("year")
        .withAggregate("funders", ["rcr_avg"], { limit: 10 })
        .getDsl();

      expect(dsl).toContain('search publications for "CRISPR"');
      expect(dsl).toContain("return year");
      expect(dsl).toContain("return funders aggregate rcr_avg limit 10");
    });
  });
});
