/**
 * Integration tests for Fluent Query Builder API.
 * Tests full fluent API flow against the real Dimensions API.
 * @module test/integration/fluent-api.integration
 */

import { beforeAll, describe, expect, it } from "vitest";
import { DimensionsClient } from "../../../../src/dsl/index.js";

import { loadTestConfig } from "./test-config.js";

const config = loadTestConfig(); // was: process.env.DIMENSIONS_API_KEY
const TIMEOUT = 30_000;
const RATE_LIMIT_TIMEOUT = 90_000;

describe.skipIf(!config)("Fluent API Integration", () => {
  let client: DimensionsClient;

  beforeAll(() => {
    client = new DimensionsClient({
      apiKey: config!.apiKey,
      ...(config!.baseUrl && { baseUrl: config!.baseUrl }),
      rateLimitPerMinute: 30,
    });
  });

  describe("publications()", () => {
    it(
      "executes basic search",
      async () => {
        const result = await client.publications().for("CRISPR").limit(5).execute();

        expect(result.data.length).toBeGreaterThan(0);
        expect(result.totalCount).toBeGreaterThan(0);
        expect(result.data[0]).toHaveProperty("id");
      },
      TIMEOUT,
    );

    it(
      "executes search with where clause",
      async () => {
        const result = await client
          .publications()
          .for("machine learning")
          .where("year", ">=", 2023)
          .limit(5)
          .execute();

        expect(result.data.length).toBeGreaterThan(0);
        for (const pub of result.data) {
          if (pub.year) expect(pub.year).toBeGreaterThanOrEqual(2023);
        }
      },
      TIMEOUT,
    );

    it(
      "executes search with fields selection",
      async () => {
        const result = await client
          .publications()
          .for("genomics")
          .fields(["id", "title", "year"])
          .limit(3)
          .execute();

        expect(result.data.length).toBeGreaterThan(0);
        expect(result.data[0].id).toBeDefined();
        expect(result.data[0].abstract).toBeUndefined();
      },
      TIMEOUT,
    );

    it(
      "executes search with boolean logic",
      async () => {
        const result = await client
          .publications()
          .for("research")
          .openGroup()
          .where("type", "=", "article")
          .or()
          .where("type", "=", "review")
          .closeGroup()
          .where("year", ">=", 2020)
          .limit(5)
          .execute();

        expect(result.data.length).toBeGreaterThan(0);
      },
      TIMEOUT,
    );

    it(
      "executes search with sorting and pagination",
      async () => {
        const result = await client
          .publications()
          .for("cancer")
          .sort("times_cited", "desc")
          .limit(10)
          .skip(5)
          .execute();

        expect(result.data.length).toBeLessThanOrEqual(10);
      },
      TIMEOUT,
    );
  });

  describe("grants()", () => {
    it(
      "executes basic search",
      async () => {
        const result = await client.grants().for("cancer research").limit(5).execute();

        expect(result.data.length).toBeGreaterThan(0);
        expect(result.data[0]).toHaveProperty("id");
      },
      RATE_LIMIT_TIMEOUT,
    );
  });

  describe("patents()", () => {
    it(
      "executes basic search",
      async () => {
        const result = await client.patents().for("battery technology").limit(5).execute();

        expect(result.data.length).toBeGreaterThan(0);
        expect(result.data[0]).toHaveProperty("id");
      },
      RATE_LIMIT_TIMEOUT,
    );
  });

  describe("clinicalTrials()", () => {
    it(
      "executes basic search",
      async () => {
        const result = await client.clinicalTrials().for("diabetes").limit(5).execute();

        expect(result.data.length).toBeGreaterThan(0);
      },
      RATE_LIMIT_TIMEOUT,
    );
  });

  describe("datasets()", () => {
    it(
      "executes basic search",
      async () => {
        const result = await client.datasets().for("genomics").limit(5).execute();

        expect(result.data.length).toBeGreaterThan(0);
      },
      RATE_LIMIT_TIMEOUT,
    );
  });

  describe("organizations()", () => {
    it(
      "executes basic search",
      async () => {
        const result = await client.organizations().for("university").limit(5).execute();

        expect(result.data.length).toBeGreaterThan(0);
      },
      RATE_LIMIT_TIMEOUT,
    );
  });

  describe("policyDocuments()", () => {
    it(
      "executes basic search",
      async () => {
        const result = await client.policyDocuments().for("climate").limit(5).execute();

        expect(result.data.length).toBeGreaterThan(0);
      },
      RATE_LIMIT_TIMEOUT,
    );
  });

  describe("researchers()", () => {
    it(
      "executes basic search",
      async () => {
        const result = await client.researchers().for("*").limit(5).execute();

        expect(result).toHaveProperty("data");
        expect(result).toHaveProperty("totalCount");
      },
      RATE_LIMIT_TIMEOUT,
    );
  });

  describe("getDsl()", () => {
    it("returns DSL without executing", () => {
      const dsl = client.publications().for("test").where("year", ">=", 2020).getDsl();

      expect(dsl).toBe('search publications for "test" where year >= 2020');
    });
  });

  describe("complex chained operations", () => {
    it(
      "chains multiple where clauses with different operators",
      async () => {
        const result = await client
          .publications()
          .for("machine learning")
          .where("year", ">=", 2020)
          .where("year", "<=", 2024)
          .where("type", "=", "article")
          .fields(["id", "title", "year", "type"])
          .limit(10)
          .execute();

        expect(result.data.length).toBeGreaterThan(0);
        for (const pub of result.data) {
          if (pub.year) {
            expect(pub.year).toBeGreaterThanOrEqual(2020);
            expect(pub.year).toBeLessThanOrEqual(2024);
          }
          if (pub.type) {
            expect(pub.type).toBe("article");
          }
        }
      },
      RATE_LIMIT_TIMEOUT,
    );

    it(
      "uses whereIn for list filtering",
      async () => {
        const result = await client
          .publications()
          .for("research")
          .whereIn("year", [2022, 2023, 2024])
          .fields(["id", "title", "year"])
          .limit(10)
          .execute();

        expect(result.data.length).toBeGreaterThan(0);
        for (const pub of result.data) {
          if (pub.year) {
            expect([2022, 2023, 2024]).toContain(pub.year);
          }
        }
      },
      RATE_LIMIT_TIMEOUT,
    );

    it(
      "uses whereRange for year range filtering",
      async () => {
        const result = await client
          .publications()
          .for("genomics")
          .whereRange("year", 2021, 2023)
          .fields(["id", "title", "year"])
          .limit(10)
          .execute();

        expect(result.data.length).toBeGreaterThan(0);
        for (const pub of result.data) {
          if (pub.year) {
            expect(pub.year).toBeGreaterThanOrEqual(2021);
            expect(pub.year).toBeLessThanOrEqual(2023);
          }
        }
      },
      RATE_LIMIT_TIMEOUT,
    );

    it(
      "uses whereNotEmpty to filter for publications with DOI",
      async () => {
        const result = await client
          .publications()
          .for("neuroscience")
          .whereNotEmpty("doi")
          .fields(["id", "title", "doi"])
          .limit(10)
          .execute();

        expect(result.data.length).toBeGreaterThan(0);
        for (const pub of result.data) {
          expect(pub.doi).toBeDefined();
          expect(pub.doi).not.toBe("");
        }
      },
      RATE_LIMIT_TIMEOUT,
    );

    it(
      "uses whereCount to filter by author count",
      async () => {
        const result = await client
          .publications()
          .for("collaborative research")
          .whereCount("authors", ">=", 5)
          .fields(["id", "title", "authors"])
          .limit(10)
          .execute();

        expect(result.data.length).toBeGreaterThan(0);
        for (const pub of result.data) {
          if (pub.authors) {
            expect(pub.authors.length).toBeGreaterThanOrEqual(5);
          }
        }
      },
      RATE_LIMIT_TIMEOUT,
    );

    it(
      "combines OR logic with groups for type filtering",
      async () => {
        const result = await client
          .publications()
          .for("science")
          .where("year", ">=", 2022)
          .openGroup()
          .where("type", "=", "article")
          .or()
          .where("type", "=", "review")
          .or()
          .where("type", "=", "proceeding")
          .closeGroup()
          .fields(["id", "title", "type", "year"])
          .limit(15)
          .execute();

        expect(result.data.length).toBeGreaterThan(0);
        for (const pub of result.data) {
          if (pub.type) {
            expect(["article", "review", "proceeding"]).toContain(pub.type);
          }
        }
      },
      RATE_LIMIT_TIMEOUT,
    );

    it(
      "combines nested groups with AND/OR logic",
      async () => {
        // (type = article OR type = review) AND (year >= 2022)
        const result = await client
          .publications()
          .for("research")
          .openGroup()
          .where("type", "=", "article")
          .or()
          .where("type", "=", "review")
          .closeGroup()
          .and()
          .openGroup()
          .where("year", ">=", 2022)
          .closeGroup()
          .fields(["id", "title", "type", "year"])
          .limit(10)
          .execute();

        expect(result.data.length).toBeGreaterThan(0);
        for (const pub of result.data) {
          if (pub.type) {
            expect(["article", "review"]).toContain(pub.type);
          }
          if (pub.year) {
            expect(pub.year).toBeGreaterThanOrEqual(2022);
          }
        }
      },
      RATE_LIMIT_TIMEOUT,
    );

    it(
      "uses search index with in() for title_abstract search",
      async () => {
        const result = await client
          .publications()
          .in("title_abstract_only")
          .for("quantum computing")
          .where("year", ">=", 2020)
          .fields(["id", "title", "abstract"])
          .limit(10)
          .execute();

        expect(result.data.length).toBeGreaterThan(0);
        // Results should have quantum or computing in title or abstract
        for (const pub of result.data) {
          const searchableText = `${pub.title ?? ""} ${pub.abstract ?? ""}`.toLowerCase();
          const hasQuantum = searchableText.includes("quantum");
          const hasComputing = searchableText.includes("computing");
          expect(hasQuantum || hasComputing).toBe(true);
        }
      },
      RATE_LIMIT_TIMEOUT,
    );

    it(
      "combines all filter types in a single query",
      async () => {
        // Complex query: search for ML papers, recent years, articles or reviews,
        // with DOI, multiple authors, sorted by citations
        const result = await client
          .publications()
          .for("deep learning")
          .whereRange("year", 2021, 2024)
          .openGroup()
          .where("type", "=", "article")
          .or()
          .where("type", "=", "review")
          .closeGroup()
          .whereNotEmpty("doi")
          .whereCount("authors", ">=", 2)
          .fields(["id", "title", "year", "type", "doi", "authors", "times_cited"])
          .sort("times_cited", "desc")
          .limit(10)
          .execute();

        expect(result.data.length).toBeGreaterThan(0);
        for (const pub of result.data) {
          if (pub.year) {
            expect(pub.year).toBeGreaterThanOrEqual(2021);
            expect(pub.year).toBeLessThanOrEqual(2024);
          }
          if (pub.type) {
            expect(["article", "review"]).toContain(pub.type);
          }
          expect(pub.doi).toBeDefined();
          if (pub.authors) {
            expect(pub.authors.length).toBeGreaterThanOrEqual(2);
          }
        }
      },
      RATE_LIMIT_TIMEOUT,
    );

    it(
      "paginates through results with skip and limit",
      async () => {
        // Get first page
        const page1 = await client
          .publications()
          .for("climate change")
          .where("year", "=", 2023)
          .fields(["id", "title"])
          .sort("id", "asc")
          .limit(5)
          .execute();

        // Get second page
        const page2 = await client
          .publications()
          .for("climate change")
          .where("year", "=", 2023)
          .fields(["id", "title"])
          .sort("id", "asc")
          .skip(5)
          .limit(5)
          .execute();

        expect(page1.data.length).toBe(5);
        expect(page2.data.length).toBeGreaterThan(0);

        // Ensure no overlap between pages
        const page1Ids = new Set(page1.data.map((p) => p.id));
        for (const pub of page2.data) {
          expect(page1Ids.has(pub.id)).toBe(false);
        }
      },
      RATE_LIMIT_TIMEOUT,
    );

    it("generates correct DSL for complex chained query", () => {
      const dsl = client
        .publications()
        .in("title_abstract_only")
        .for("artificial intelligence")
        .where("year", ">=", 2020)
        .openGroup()
        .where("type", "=", "article")
        .or()
        .where("type", "=", "review")
        .closeGroup()
        .whereNotEmpty("doi")
        .fields(["id", "title", "year", "doi"])
        .sort("times_cited", "desc")
        .limit(50)
        .skip(10)
        .getDsl();

      expect(dsl).toContain("search publications");
      expect(dsl).toContain("in title_abstract_only");
      expect(dsl).toContain('for "artificial intelligence"');
      expect(dsl).toContain("year >= 2020");
      expect(dsl).toContain('type = "article"');
      expect(dsl).toContain("or");
      expect(dsl).toContain('type = "review"');
      expect(dsl).toContain("doi is not empty");
      expect(dsl).toContain("return publications[id+title+year+doi]");
      expect(dsl).toContain("sort by times_cited desc");
      expect(dsl).toContain("limit 50 skip 10");
    });

    it(
      "chains grants query with complex filters",
      async () => {
        const result = await client
          .grants()
          .for("renewable energy")
          .whereRange("start_year", 2020, 2024)
          .whereNotEmpty("funder_org_name")
          .fields(["id", "title", "start_year", "funder_org_name"])
          .sort("start_year", "desc")
          .limit(10)
          .execute();

        expect(result.data.length).toBeGreaterThan(0);
        for (const grant of result.data) {
          if (grant.start_year) {
            expect(grant.start_year).toBeGreaterThanOrEqual(2020);
            expect(grant.start_year).toBeLessThanOrEqual(2024);
          }
          expect(grant.funder_org_name).toBeDefined();
        }
      },
      RATE_LIMIT_TIMEOUT,
    );

    it(
      "chains patents query with multiple conditions",
      async () => {
        const result = await client
          .patents()
          .for("electric vehicle")
          .where("year", ">=", 2020)
          .whereNotEmpty("assignee_names")
          .fields(["id", "title", "year", "assignee_names"])
          .limit(10)
          .execute();

        expect(result.data.length).toBeGreaterThan(0);
        for (const patent of result.data) {
          if (patent.year) {
            expect(patent.year).toBeGreaterThanOrEqual(2020);
          }
        }
      },
      RATE_LIMIT_TIMEOUT,
    );

    it(
      "chains clinical trials query with phase filtering",
      async () => {
        const result = await client
          .clinicalTrials()
          .for("cancer immunotherapy")
          .whereIn("phase", ["Phase 2", "Phase 3"])
          .fields(["id", "title", "phase"])
          .limit(10)
          .execute();

        expect(result.data.length).toBeGreaterThan(0);
      },
      RATE_LIMIT_TIMEOUT,
    );
  });

  describe("error handling", () => {
    it(
      "throws error for invalid field in where clause",
      async () => {
        await expect(
          client
            .publications()
            .for("test")
            .where("nonexistent_field_xyz", "=", "value")
            .limit(1)
            .execute(),
        ).rejects.toThrow();
      },
      RATE_LIMIT_TIMEOUT,
    );

    it(
      "throws error for invalid field in return clause",
      async () => {
        await expect(
          client
            .publications()
            .for("test")
            .fields(["id", "nonexistent_field_xyz"])
            .limit(1)
            .execute(),
        ).rejects.toThrow();
      },
      RATE_LIMIT_TIMEOUT,
    );

    it(
      "throws error for invalid sort field",
      async () => {
        await expect(
          client.publications().for("test").sort("invalid_sort_field", "desc").limit(1).execute(),
        ).rejects.toThrow();
      },
      RATE_LIMIT_TIMEOUT,
    );
  });
});
