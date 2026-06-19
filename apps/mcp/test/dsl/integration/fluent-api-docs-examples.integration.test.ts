/**
 * Integration tests to validate the code examples in docs/FLUENT_API_GUIDE.md.
 * Ensures documentation examples work correctly against the real Dimensions API.
 * @module test/integration/fluent-api-docs-examples.integration
 */

import { beforeAll, describe, expect, it } from "vitest";
import { DimensionsClient } from "../../../../src/dsl/index.js";

import { loadTestConfig } from "./test-config.js";

const config = loadTestConfig(); // was: process.env.DIMENSIONS_API_KEY
const TIMEOUT = 30_000;
const RATE_LIMIT_TIMEOUT = 90_000;
const EXTENDED_TIMEOUT = 120_000;

/**
 * These tests validate that the code examples in the FLUENT_API_GUIDE.md
 * documentation work correctly against the real Dimensions API.
 */
describe.skipIf(!config)("FLUENT_API_GUIDE.md Examples Validation", () => {
  let client: DimensionsClient;

  beforeAll(() => {
    client = new DimensionsClient({
      apiKey: config!.apiKey,
      ...(config!.baseUrl && { baseUrl: config!.baseUrl }),
      rateLimitPerMinute: 30,
    });
  });

  describe("Real-World Examples (Examples 1-6)", () => {
    /**
     * Example 1: Find Highly-Cited Recent Research
     * From docs/FLUENT_API_GUIDE.md lines 532-554
     */
    it(
      "Example 1: Find Highly-Cited Recent Research",
      async () => {
        const result = await client
          .publications()
          .for("deep learning")
          .whereRange("year", 2021, 2024)
          .where("times_cited", ">=", 100)
          .openGroup()
          .where("type", "=", "article")
          .or()
          .where("type", "=", "review")
          .closeGroup()
          .fields(["id", "title", "year", "times_cited", "doi"])
          .sort("times_cited", "desc")
          .limit(50)
          .execute();

        // Verify result structure
        expect(result).toHaveProperty("data");
        expect(result).toHaveProperty("totalCount");
        expect(Array.isArray(result.data)).toBe(true);
        expect(result.data.length).toBeGreaterThan(0);

        // Verify each returned publication has the expected fields and values
        for (const pub of result.data) {
          // Check expected fields exist
          expect(pub.id).toBeDefined();
          expect(pub.title).toBeDefined();

          // Verify year is in range (if present)
          if (pub.year) {
            expect(pub.year).toBeGreaterThanOrEqual(2021);
            expect(pub.year).toBeLessThanOrEqual(2024);
          }

          // Verify citations >= 100 (if present)
          if (pub.times_cited !== undefined) {
            expect(pub.times_cited).toBeGreaterThanOrEqual(100);
          }

          // Verify type is article or review (if present)
          if (pub.type) {
            expect(["article", "review"]).toContain(pub.type);
          }
        }

        // Verify sorting (times_cited should be descending)
        for (let i = 1; i < result.data.length; i++) {
          const prev = result.data[i - 1]?.times_cited ?? 0;
          const curr = result.data[i]?.times_cited ?? 0;
          expect(prev).toBeGreaterThanOrEqual(curr);
        }
      },
      EXTENDED_TIMEOUT,
    );

    /**
     * Example 2: Find Collaborative Open Science
     * From docs/FLUENT_API_GUIDE.md lines 557-573
     */
    it(
      "Example 2: Find Collaborative Open Science",
      async () => {
        const result = await client
          .publications()
          .for("genomics")
          .whereRange("year", 2020, 2024)
          .whereCount("authors", ">=", 5)
          .whereNotEmpty("doi")
          .where("open_access", "!=", "closed")
          .fields(["id", "title", "authors_count", "doi", "open_access"])
          .limit(20)
          .execute();

        // Verify result structure
        expect(result).toHaveProperty("data");
        expect(result).toHaveProperty("totalCount");
        expect(result.data.length).toBeGreaterThan(0);

        // Verify each publication meets the criteria
        for (const pub of result.data) {
          expect(pub.id).toBeDefined();
          expect(pub.title).toBeDefined();

          // Verify DOI is present (not empty)
          expect(pub.doi).toBeDefined();
          expect(pub.doi).not.toBe("");

          // Verify open access is not closed (if present)
          if (pub.open_access) {
            expect(pub.open_access).not.toBe("closed");
          }

          // Note: authors_count validation depends on API returning this field
          // The whereCount filter ensures >= 5 authors, but authors_count field
          // may not always be returned even if requested
        }
      },
      RATE_LIMIT_TIMEOUT,
    );

    /**
     * Example 3: Track Funding by Topic and Year
     * From docs/FLUENT_API_GUIDE.md lines 575-597
     */
    it(
      "Example 3: Track Funding by Topic and Year",
      async () => {
        const result = await client
          .grants()
          .for("renewable energy")
          .whereRange("start_year", 2020, 2024)
          .whereNotEmpty("funder_org_name")
          .whereNotEmpty("funding_usd")
          .fields(["id", "title", "start_year", "funder_org_name", "funding_usd"])
          .sort("funding_usd", "desc")
          .limit(100)
          .execute();

        // Verify result structure
        expect(result).toHaveProperty("data");
        expect(result).toHaveProperty("totalCount");
        expect(result.data.length).toBeGreaterThan(0);

        // Verify each grant meets the criteria
        for (const grant of result.data) {
          expect(grant.id).toBeDefined();
          expect(grant.title).toBeDefined();

          // Verify start_year is in range (if present)
          if (grant.start_year) {
            expect(grant.start_year).toBeGreaterThanOrEqual(2020);
            expect(grant.start_year).toBeLessThanOrEqual(2024);
          }

          // Verify funder_org_name is not empty (if present)
          if (grant.funder_org_name) {
            expect(grant.funder_org_name).not.toBe("");
          }
        }

        // Test the calculation pattern from the documentation
        const totalFunding = result.data.reduce((sum, grant) => sum + (grant.funding_usd ?? 0), 0);
        expect(totalFunding).toBeGreaterThan(0);
      },
      RATE_LIMIT_TIMEOUT,
    );

    /**
     * Example 4: Find Active Clinical Trials
     * From docs/FLUENT_API_GUIDE.md lines 599-616
     */
    it(
      "Example 4: Find Active Clinical Trials",
      async () => {
        const result = await client
          .clinicalTrials()
          .for("cancer immunotherapy")
          .whereIn("phase", ["Phase 2", "Phase 3", "Phase 4"])
          .where("overall_status", "=", "Recruiting")
          .fields(["id", "title", "phase", "overall_status", "conditions", "start_date"])
          .sort("start_date", "desc")
          .limit(50)
          .execute();

        // Verify result structure
        expect(result).toHaveProperty("data");
        expect(result).toHaveProperty("totalCount");
        // Note: We may get 0 results if no recruiting trials match
        expect(Array.isArray(result.data)).toBe(true);

        // Verify each trial meets the criteria (if any results)
        for (const trial of result.data) {
          expect(trial.id).toBeDefined();

          // Verify phase is in the expected list (if present)
          if (trial.phase) {
            expect(["Phase 2", "Phase 3", "Phase 4"]).toContain(trial.phase);
          }

          // Verify status is Recruiting (if present)
          if (trial.overall_status) {
            expect(trial.overall_status).toBe("Recruiting");
          }
        }
      },
      RATE_LIMIT_TIMEOUT,
    );

    /**
     * Example 5: Patent Analysis by Company
     * From docs/FLUENT_API_GUIDE.md lines 618-650
     */
    it(
      "Example 5: Patent Analysis by Company",
      async () => {
        const result = await client
          .patents()
          .for("electric vehicle battery")
          .where("year", ">=", 2020)
          .whereNotEmpty("assignees")
          .fields(["id", "title", "year", "assignees", "filing_date"])
          .sort("filing_date", "desc")
          .limit(200)
          .execute();

        // Verify result structure
        expect(result).toHaveProperty("data");
        expect(result).toHaveProperty("totalCount");
        expect(result.data.length).toBeGreaterThan(0);

        // Verify each patent meets the criteria
        for (const patent of result.data) {
          expect(patent.id).toBeDefined();
          expect(patent.title).toBeDefined();

          // Verify year >= 2020 (if present)
          if (patent.year) {
            expect(patent.year).toBeGreaterThanOrEqual(2020);
          }
        }

        // Test the grouping pattern from the documentation
        const byAssignee = new Map<string, number>();
        for (const patent of result.data) {
          if (patent.assignees) {
            for (const assignee of patent.assignees) {
              byAssignee.set(assignee.name, (byAssignee.get(assignee.name) ?? 0) + 1);
            }
          }
        }

        // Should have at least some assignees grouped
        expect(byAssignee.size).toBeGreaterThan(0);
      },
      RATE_LIMIT_TIMEOUT,
    );

    /**
     * Example 6: Researcher Profile with Publications
     * From docs/FLUENT_API_GUIDE.md lines 652-685
     *
     * NOTE: The documentation example wraps the name in extra quotes like:
     *   .for(`"${researcher.first_name} ${researcher.last_name}"`)
     * This is INCORRECT because .for() already adds quotes around the search term.
     * The correct usage is:
     *   .for(`${researcher.first_name} ${researcher.last_name}`)
     * This test uses the corrected version.
     */
    it(
      "Example 6: Researcher Profile with Publications",
      async () => {
        // First part: Find researchers
        const researchers = await client
          .researchers()
          .for("Jennifer Doudna")
          .whereNotEmpty("orcid_id")
          .limit(5)
          .execute();

        // Verify researcher search works
        expect(researchers).toHaveProperty("data");
        expect(researchers).toHaveProperty("totalCount");
        expect(Array.isArray(researchers.data)).toBe(true);

        // If researchers found, try to get their publications
        if (researchers.data.length > 0) {
          const researcher = researchers.data[0];

          // Verify researcher structure
          expect(researcher).toHaveProperty("id");

          // Second part: Search for publications by researcher name
          // Note: Do NOT add extra quotes - for() already quotes the search term
          if (researcher.first_name && researcher.last_name) {
            const publications = await client
              .publications()
              .for(`${researcher.first_name} ${researcher.last_name}`)
              .in("authors")
              .whereRange("year", 2020, 2024)
              .fields(["id", "title", "year", "times_cited"])
              .sort("times_cited", "desc")
              .limit(20)
              .execute();

            // Verify publications result
            expect(publications).toHaveProperty("data");
            expect(publications).toHaveProperty("totalCount");
            expect(Array.isArray(publications.data)).toBe(true);

            // Verify year range if publications exist
            for (const pub of publications.data) {
              if (pub.year) {
                expect(pub.year).toBeGreaterThanOrEqual(2020);
                expect(pub.year).toBeLessThanOrEqual(2024);
              }
            }
          }
        }
      },
      EXTENDED_TIMEOUT,
    );
  });

  describe("Basic Query Examples", () => {
    /**
     * Basic query with where clauses
     * From docs/FLUENT_API_GUIDE.md lines 255-263
     */
    it(
      "basic filters with where clause",
      async () => {
        const result = await client
          .publications()
          .for("AI")
          .where("year", ">=", 2020)
          .where("times_cited", ">", 100)
          .where("type", "=", "article")
          .limit(10)
          .execute();

        expect(result).toHaveProperty("data");
        expect(result).toHaveProperty("totalCount");

        for (const pub of result.data) {
          if (pub.year) {
            expect(pub.year).toBeGreaterThanOrEqual(2020);
          }
          if (pub.times_cited !== undefined) {
            expect(pub.times_cited).toBeGreaterThan(100);
          }
          if (pub.type) {
            expect(pub.type).toBe("article");
          }
        }
      },
      RATE_LIMIT_TIMEOUT,
    );

    /**
     * whereEmpty and whereNotEmpty usage
     * From docs/FLUENT_API_GUIDE.md lines 279-286
     */
    it(
      "whereEmpty and whereNotEmpty filters",
      async () => {
        const result = await client
          .publications()
          .for("research")
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
  });

  describe("whereIn Examples", () => {
    /**
     * List filters with whereIn
     * From docs/FLUENT_API_GUIDE.md lines 290-299
     */
    it(
      "whereIn for type filtering",
      async () => {
        const result = await client
          .publications()
          .for("science")
          .whereIn("type", ["article", "review", "preprint"])
          .whereIn("year", [2022, 2023, 2024])
          .fields(["id", "title", "type", "year"])
          .limit(20)
          .execute();

        expect(result.data.length).toBeGreaterThan(0);

        for (const pub of result.data) {
          if (pub.type) {
            expect(["article", "review", "preprint"]).toContain(pub.type);
          }
          if (pub.year) {
            expect([2022, 2023, 2024]).toContain(pub.year);
          }
        }
      },
      RATE_LIMIT_TIMEOUT,
    );
  });

  describe("whereRange Examples", () => {
    /**
     * Range filters with whereRange
     * From docs/FLUENT_API_GUIDE.md lines 303-312
     */
    it(
      "whereRange for year and citations",
      async () => {
        const result = await client
          .publications()
          .for("genomics")
          .whereRange("year", 2020, 2024)
          .whereRange("times_cited", 10, 100)
          .fields(["id", "title", "year", "times_cited"])
          .limit(20)
          .execute();

        expect(result).toHaveProperty("data");

        for (const pub of result.data) {
          if (pub.year) {
            expect(pub.year).toBeGreaterThanOrEqual(2020);
            expect(pub.year).toBeLessThanOrEqual(2024);
          }
          if (pub.times_cited !== undefined) {
            expect(pub.times_cited).toBeGreaterThanOrEqual(10);
            expect(pub.times_cited).toBeLessThanOrEqual(100);
          }
        }
      },
      RATE_LIMIT_TIMEOUT,
    );
  });

  describe("whereCount Examples", () => {
    /**
     * Count filters with whereCount
     * From docs/FLUENT_API_GUIDE.md lines 316-332
     */
    it(
      "whereCount for collaborative research (5+ authors)",
      async () => {
        const result = await client
          .publications()
          .for("research")
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

    /**
     * whereCount for single-author publications
     * From docs/FLUENT_API_GUIDE.md lines 328-332
     */
    it(
      "whereCount for single-author publications",
      async () => {
        const result = await client
          .publications()
          .for("research")
          .whereCount("authors", "=", 1)
          .fields(["id", "title", "authors"])
          .limit(10)
          .execute();

        expect(result.data.length).toBeGreaterThan(0);

        for (const pub of result.data) {
          if (pub.authors) {
            expect(pub.authors.length).toBe(1);
          }
        }
      },
      RATE_LIMIT_TIMEOUT,
    );
  });

  describe("Boolean Logic Examples", () => {
    /**
     * AND logic (default behavior)
     * From docs/FLUENT_API_GUIDE.md lines 340-352
     */
    it(
      "AND logic - multiple conditions combined",
      async () => {
        const result = await client
          .publications()
          .for("AI")
          .where("year", ">=", 2020)
          .where("type", "=", "article")
          .fields(["id", "year", "type"])
          .limit(10)
          .execute();

        expect(result.data.length).toBeGreaterThan(0);

        for (const pub of result.data) {
          if (pub.year) {
            expect(pub.year).toBeGreaterThanOrEqual(2020);
          }
          if (pub.type) {
            expect(pub.type).toBe("article");
          }
        }
      },
      RATE_LIMIT_TIMEOUT,
    );

    /**
     * OR logic
     * From docs/FLUENT_API_GUIDE.md lines 354-368
     */
    it(
      "OR logic - alternative conditions",
      async () => {
        const result = await client
          .publications()
          .for("research")
          .where("type", "=", "article")
          .or()
          .where("type", "=", "review")
          .fields(["id", "type"])
          .limit(10)
          .execute();

        expect(result.data.length).toBeGreaterThan(0);

        for (const pub of result.data) {
          if (pub.type) {
            expect(["article", "review"]).toContain(pub.type);
          }
        }
      },
      RATE_LIMIT_TIMEOUT,
    );

    /**
     * NOT logic
     * From docs/FLUENT_API_GUIDE.md lines 370-383
     */
    it(
      "NOT logic - negation",
      async () => {
        const result = await client
          .publications()
          .for("research")
          .where("type", "=", "article")
          .not()
          .where("open_access", "=", "closed")
          .fields(["id", "type", "open_access"])
          .limit(10)
          .execute();

        expect(result.data.length).toBeGreaterThan(0);

        for (const pub of result.data) {
          if (pub.type) {
            expect(pub.type).toBe("article");
          }
          // open_access should not be "closed"
          if (pub.open_access) {
            expect(pub.open_access).not.toBe("closed");
          }
        }
      },
      RATE_LIMIT_TIMEOUT,
    );

    /**
     * Explicit AND
     * From docs/FLUENT_API_GUIDE.md lines 385-398
     */
    it(
      "explicit AND - same as default",
      async () => {
        const result = await client
          .publications()
          .for("AI")
          .where("year", ">=", 2020)
          .and()
          .where("type", "=", "article")
          .fields(["id", "year", "type"])
          .limit(10)
          .execute();

        expect(result.data.length).toBeGreaterThan(0);

        for (const pub of result.data) {
          if (pub.year) {
            expect(pub.year).toBeGreaterThanOrEqual(2020);
          }
          if (pub.type) {
            expect(pub.type).toBe("article");
          }
        }
      },
      RATE_LIMIT_TIMEOUT,
    );
  });

  describe("Grouping Examples", () => {
    /**
     * Basic grouping with openGroup/closeGroup
     * From docs/FLUENT_API_GUIDE.md lines 400-418
     */
    it(
      "grouping with parentheses",
      async () => {
        const result = await client
          .publications()
          .for("research")
          .openGroup()
          .where("type", "=", "article")
          .or()
          .where("type", "=", "review")
          .closeGroup()
          .and()
          .where("year", ">=", 2020)
          .fields(["id", "type", "year"])
          .limit(10)
          .execute();

        expect(result.data.length).toBeGreaterThan(0);

        for (const pub of result.data) {
          if (pub.type) {
            expect(["article", "review"]).toContain(pub.type);
          }
          if (pub.year) {
            expect(pub.year).toBeGreaterThanOrEqual(2020);
          }
        }
      },
      RATE_LIMIT_TIMEOUT,
    );

    /**
     * Nested groups
     * From docs/FLUENT_API_GUIDE.md lines 420-442
     */
    it(
      "nested groups for complex logic",
      async () => {
        const result = await client
          .publications()
          .for("science")
          .openGroup()
          .openGroup()
          .where("type", "=", "article")
          .or()
          .where("type", "=", "review")
          .closeGroup()
          .and()
          .where("year", ">=", 2020)
          .closeGroup()
          .and()
          .whereNotEmpty("doi")
          .fields(["id", "type", "year", "doi"])
          .limit(10)
          .execute();

        expect(result.data.length).toBeGreaterThan(0);

        for (const pub of result.data) {
          if (pub.type) {
            expect(["article", "review"]).toContain(pub.type);
          }
          if (pub.year) {
            expect(pub.year).toBeGreaterThanOrEqual(2020);
          }
          expect(pub.doi).toBeDefined();
          expect(pub.doi).not.toBe("");
        }
      },
      RATE_LIMIT_TIMEOUT,
    );
  });

  describe("Search Index Examples", () => {
    /**
     * Search index with in()
     * From docs/FLUENT_API_GUIDE.md lines 213-222
     */
    it(
      "search index - title_abstract_only",
      async () => {
        const result = await client
          .publications()
          .in("title_abstract_only")
          .for("CRISPR gene editing")
          .fields(["id", "title", "abstract"])
          .limit(10)
          .execute();

        expect(result.data.length).toBeGreaterThan(0);

        // Results should have CRISPR in title or abstract
        for (const pub of result.data) {
          const searchableText = `${pub.title ?? ""} ${pub.abstract ?? ""}`.toLowerCase();
          const hasCrispr = searchableText.includes("crispr");
          const hasGene = searchableText.includes("gene");
          const hasEditing = searchableText.includes("editing");
          // At least one of the search terms should appear
          expect(hasCrispr || hasGene || hasEditing).toBe(true);
        }
      },
      RATE_LIMIT_TIMEOUT,
    );
  });

  describe("getDsl() Validation", () => {
    /**
     * getDsl() should match documented output
     * From docs/FLUENT_API_GUIDE.md lines 449-462
     */
    it("getDsl generates expected DSL query", () => {
      const dsl = client
        .publications()
        .for("machine learning")
        .where("year", ">=", 2020)
        .where("type", "=", "article")
        .fields(["id", "title"])
        .getDsl();

      // Verify the DSL contains expected parts
      expect(dsl).toContain("search publications");
      expect(dsl).toContain('for "machine learning"');
      expect(dsl).toContain("year >= 2020");
      expect(dsl).toContain('type = "article"');
      expect(dsl).toContain("return publications[id+title]");
    });

    /**
     * Complex getDsl example
     */
    it("getDsl for complex query with all features", () => {
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
  });

  describe("Field Validation", () => {
    /**
     * Verify all fields used in documentation examples are valid
     */
    it(
      "publication fields from examples are valid",
      async () => {
        const result = await client
          .publications()
          .for("test")
          .fields([
            "id",
            "title",
            "doi",
            "year",
            "times_cited",
            "type",
            "open_access",
            "authors",
            "authors_count",
            "abstract",
          ])
          .limit(1)
          .execute();

        // If we get here without error, the fields are valid
        expect(result).toHaveProperty("data");
      },
      TIMEOUT,
    );

    it(
      "grant fields from examples are valid",
      async () => {
        const result = await client
          .grants()
          .for("test")
          .fields(["id", "title", "start_year", "funder_org_name", "funding_usd"])
          .limit(1)
          .execute();

        expect(result).toHaveProperty("data");
      },
      TIMEOUT,
    );

    it(
      "clinical trial fields from examples are valid",
      async () => {
        const result = await client
          .clinicalTrials()
          .for("test")
          .fields(["id", "title", "phase", "overall_status", "conditions", "start_date"])
          .limit(1)
          .execute();

        expect(result).toHaveProperty("data");
      },
      TIMEOUT,
    );

    it(
      "patent fields from examples are valid",
      async () => {
        const result = await client
          .patents()
          .for("test")
          .fields(["id", "title", "year", "assignees", "filing_date"])
          .limit(1)
          .execute();

        expect(result).toHaveProperty("data");
      },
      TIMEOUT,
    );

    it(
      "researcher fields from examples are valid",
      async () => {
        const result = await client.researchers().for("*").limit(1).execute();

        expect(result).toHaveProperty("data");
        if (result.data.length > 0) {
          // Check that researcher has expected structure
          const researcher = result.data[0];
          expect(researcher).toHaveProperty("id");
        }
      },
      TIMEOUT,
    );
  });

  describe("Pagination Examples", () => {
    /**
     * Pagination with limit and skip
     * From docs/FLUENT_API_GUIDE.md lines 177-196
     */
    it(
      "pagination works correctly",
      async () => {
        // Get first page
        const page1 = await client
          .publications()
          .for("climate change")
          .fields(["id", "title"])
          .sort("id", "asc")
          .limit(5)
          .execute();

        expect(page1.data.length).toBe(5);

        // Get second page
        const page2 = await client
          .publications()
          .for("climate change")
          .fields(["id", "title"])
          .sort("id", "asc")
          .skip(5)
          .limit(5)
          .execute();

        expect(page2.data.length).toBeGreaterThan(0);

        // Ensure no overlap
        const page1Ids = new Set(page1.data.map((p) => p.id));
        for (const pub of page2.data) {
          expect(page1Ids.has(pub.id)).toBe(false);
        }
      },
      EXTENDED_TIMEOUT,
    );
  });

  describe("Type Safety Validation", () => {
    /**
     * Verify returned data has correct types as documented
     * From docs/FLUENT_API_GUIDE.md lines 43-53
     */
    it(
      "result.data is correctly typed array",
      async () => {
        const result = await client
          .publications()
          .for("CRISPR")
          .fields(["id", "title", "doi"])
          .limit(5)
          .execute();

        // result.data should be an array
        expect(Array.isArray(result.data)).toBe(true);

        // Each item should have the structure of a Publication
        for (const pub of result.data) {
          expect(typeof pub.id).toBe("string");
          expect(typeof pub.title).toBe("string");
          // doi is optional, but if present should be string
          if (pub.doi !== undefined) {
            expect(typeof pub.doi).toBe("string");
          }
        }
      },
      TIMEOUT,
    );

    it(
      "result.totalCount is a number",
      async () => {
        const result = await client.publications().for("genomics").limit(1).execute();

        expect(typeof result.totalCount).toBe("number");
        expect(result.totalCount).toBeGreaterThanOrEqual(0);
      },
      TIMEOUT,
    );
  });
});
