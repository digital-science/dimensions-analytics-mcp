/**
 * Integration tests for DimensionsClient structured search via QueryBuilder.
 * @module test/integration/client.integration
 */

import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { DimensionsClient, QueryBuilder, ValidationError } from "../../../../src/dsl/index.js";
import { runSearch } from "./search-helpers.js";
import { loadTestConfig } from "./test-config.js";

const config = loadTestConfig();

const INTEGRATION_TEST_TIMEOUT = 30_000;
const RATE_LIMIT_AWARE_TIMEOUT = 90_000;

describe.skipIf(!config)("DimensionsClient Integration", () => {
  let client: DimensionsClient;

  beforeAll(() => {
    if (!config) {
      throw new Error("Config is required - this should not happen due to skipIf");
    }

    client = new DimensionsClient({
      apiKey: config.apiKey,
      ...(config.baseUrl && { baseUrl: config.baseUrl }),
      rateLimitPerMinute: 30,
    });
  });

  beforeEach(() => {
    client.resetRateLimiter();
  });

  describe("publications search", () => {
    it("searches with basic query", async () => {
      const result = await runSearch(client, "publications", (qb) =>
        qb.for("CRISPR gene editing").limit(5),
      );

      expect(result.data.length).toBeGreaterThan(0);
      expect(result.data.length).toBeLessThanOrEqual(5);
      expect(result.totalCount).toBeGreaterThan(0);
      expect(result.data[0]).toHaveProperty("id");
      expect(result.data[0]).toHaveProperty("title");
    });

    it("searches with specific fields", async () => {
      const result = await runSearch(client, "publications", (qb) =>
        qb.for("machine learning").limit(3).fields(["id", "title", "doi", "year"]),
      );

      expect(result.data.length).toBeGreaterThan(0);
      expect(result.data[0]?.id).toBeDefined();
      expect(result.data[0]?.title).toBeDefined();
    });

    it("searches with year filter", async () => {
      const result = await runSearch(client, "publications", (qb) =>
        qb
          .for("artificial intelligence")
          .where("year", ">=", 2023)
          .where("year", "<=", 2024)
          .limit(5),
      );

      expect(result.data.length).toBeGreaterThan(0);
      for (const pub of result.data) {
        const year = (pub as { year?: number }).year;
        if (year !== undefined) {
          expect(year).toBeGreaterThanOrEqual(2023);
          expect(year).toBeLessThanOrEqual(2024);
        }
      }
    });

    it("supports pagination with skip", async () => {
      const firstPage = await runSearch(client, "publications", (qb) =>
        qb.for("neural networks").limit(3).skip(0),
      );
      const secondPage = await runSearch(client, "publications", (qb) =>
        qb.for("neural networks").limit(3).skip(3),
      );

      expect(firstPage.data.length).toBe(3);
      expect(secondPage.data.length).toBe(3);
      const firstIds = firstPage.data.map((p) => (p as { id: string }).id);
      const secondIds = secondPage.data.map((p) => (p as { id: string }).id);
      expect(firstIds).not.toEqual(secondIds);
    });

    it("filters by publication type", async () => {
      const result = await runSearch(client, "publications", (qb) =>
        qb.for("cancer").where("type", "=", "article").limit(5),
      );

      expect(result.data.length).toBeGreaterThan(0);
      for (const pub of result.data) {
        const type = (pub as { type?: string }).type;
        if (type) expect(type).toBe("article");
      }
    });
  });

  describe("grants search", () => {
    it("searches grants with basic query", async () => {
      const result = await runSearch(client, "grants", (qb) => qb.for("cancer research").limit(5));

      expect(result.data.length).toBeGreaterThan(0);
      expect(result.totalCount).toBeGreaterThan(0);
      expect(result.data[0]).toHaveProperty("id");
      expect(result.data[0]).toHaveProperty("title");
    });

    it("filters by start year and funder", async () => {
      const result = await runSearch(client, "grants", (qb) =>
        qb
          .for("research")
          .where("start_year", ">=", 2020)
          .where("start_year", "<=", 2024)
          .where("funder_org_name", "=", "National Institutes of Health")
          .limit(5),
      );

      expect(result.data.length).toBeGreaterThanOrEqual(0);
      expect(result.totalCount).toBeGreaterThanOrEqual(0);
    });
  });

  describe("researchers search", () => {
    it("returns researcher rows", async () => {
      const result = await runSearch(client, "researchers", (qb) => qb.for("*").limit(5));

      expect(Array.isArray(result.data)).toBe(true);
      expect(result.totalCount).toBeGreaterThanOrEqual(0);
    });
  });

  describe("patents search", () => {
    it("searches patents with year filter", async () => {
      const result = await runSearch(client, "patents", (qb) =>
        qb.for("battery technology").where("year", ">=", 2020).where("year", "<=", 2023).limit(5),
      );

      expect(result.data.length).toBeGreaterThan(0);
    });
  });

  describe("clinical_trials search", () => {
    it(
      "searches clinical trials with phase filter",
      async () => {
        const result = await runSearch(client, "clinical_trials", (qb) =>
          qb.for("diabetes").where("phase", "=", "Phase 3").limit(5),
        );

        expect(result.data.length).toBeGreaterThan(0);
        expect(result.totalCount).toBeGreaterThan(0);
      },
      RATE_LIMIT_AWARE_TIMEOUT,
    );
  });

  describe("datasets search", () => {
    it(
      "searches datasets with year filter",
      async () => {
        const result = await runSearch(client, "datasets", (qb) =>
          qb.for("climate").where("year", ">=", 2020).where("year", "<=", 2024).limit(5),
        );

        expect(result.totalCount).toBeGreaterThanOrEqual(0);
        expect(Array.isArray(result.data)).toBe(true);
      },
      RATE_LIMIT_AWARE_TIMEOUT,
    );
  });

  describe("organizations search", () => {
    it(
      "searches organizations",
      async () => {
        const result = await runSearch(client, "organizations", (qb) =>
          qb.for("university").limit(5),
        );

        expect(result.data.length).toBeGreaterThan(0);
        expect(result.data[0]).toHaveProperty("id");
        expect(result.data[0]).toHaveProperty("name");
      },
      RATE_LIMIT_AWARE_TIMEOUT,
    );
  });

  describe("policy_documents search", () => {
    it(
      "searches policy documents",
      async () => {
        const result = await runSearch(client, "policy_documents", (qb) =>
          qb.for("climate change").limit(5),
        );

        expect(result.data.length).toBeGreaterThan(0);
        expect(result.totalCount).toBeGreaterThan(0);
      },
      RATE_LIMIT_AWARE_TIMEOUT,
    );
  });

  describe("Client behavior", () => {
    it("tracks rate limit usage", async () => {
      await runSearch(client, "publications", (qb) => qb.for("test query").limit(1));

      const infoAfter = client.getRateLimitInfo();
      expect(infoAfter.remaining).toBeLessThan(30);
      expect(infoAfter.remaining).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Client features", () => {
    it(
      "invalidates token and re-authenticates",
      async () => {
        await runSearch(client, "publications", (qb) => qb.for("test").limit(1));
        client.invalidateToken();
        const result = await runSearch(client, "publications", (qb) => qb.for("test").limit(1));
        expect(result.data).toBeDefined();
      },
      RATE_LIMIT_AWARE_TIMEOUT,
    );

    it(
      "handles concurrent requests",
      async () => {
        const requests = [
          runSearch(client, "publications", (qb) => qb.for("test1").limit(1)),
          runSearch(client, "publications", (qb) => qb.for("test2").limit(1)),
          runSearch(client, "publications", (qb) => qb.for("test3").limit(1)),
        ];

        const results = await Promise.all(requests);
        expect(results).toHaveLength(3);
        for (const result of results) {
          expect(result.data).toBeDefined();
        }
      },
      RATE_LIMIT_AWARE_TIMEOUT,
    );
  });

  describe("Edge cases", () => {
    it(
      "handles unicode queries",
      async () => {
        const result = await runSearch(client, "publications", (qb) =>
          qb.for("研究 科学").limit(3),
        );

        expect(Array.isArray(result.data)).toBe(true);
        expect(result.totalCount).toBeGreaterThanOrEqual(0);
      },
      INTEGRATION_TEST_TIMEOUT,
    );

    it(
      "returns totalCount greater than or equal to results length",
      async () => {
        const result = await runSearch(client, "publications", (qb) => qb.for("biology").limit(5));

        expect(result.totalCount).toBeGreaterThanOrEqual(result.data.length);
      },
      INTEGRATION_TEST_TIMEOUT,
    );
  });

  describe("Error handling", () => {
    it("throws error with invalid API key", async () => {
      const badClient = new DimensionsClient({
        apiKey: "invalid-api-key-12345",
        ...(config!.baseUrl && { baseUrl: config!.baseUrl }),
      });

      await expect(
        runSearch(badClient, "publications", (qb) => qb.for("test").limit(1)),
      ).rejects.toThrow();
    });

    it("throws ValidationError for negative limit", () => {
      expect(() => new QueryBuilder().search("publications").for("test").limit(-1).build()).toThrow(
        ValidationError,
      );
    });
  });
});
