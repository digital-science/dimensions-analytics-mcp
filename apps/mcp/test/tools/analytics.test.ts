/**
 * Tests for analytics MCP tools.
 * Verifies that all 4 analytics tools are registered and that each tool
 * correctly creates commands, sends them via the client, and formats results.
 * @module test/tools/analytics
 */

import { beforeEach, describe, expect, it } from "vitest";
import { registerAnalyticsTools } from "../../src/mcp/tools/analytics.js";
import { testSchemaStore } from "../helpers/schema-fixture.js";
import {
  callTool,
  createMockClient,
  createMockServer,
  parseToolResult,
} from "../helpers/tool-test-harness.js";

describe("analytics tools", () => {
  let handlers: ReturnType<typeof createMockServer>["handlers"];
  let server: ReturnType<typeof createMockServer>["server"];
  let client: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    ({ server, handlers } = createMockServer());
    client = createMockClient();
    registerAnalyticsTools(server as never, client as never, testSchemaStore());
  });

  it("registers all 4 analytics tools", () => {
    const expectedTools = ["facet_query", "aggregate_query", "citation_trend", "funding_trend"];
    for (const name of expectedTools) {
      expect(handlers.has(name)).toBe(true);
    }
    expect(handlers.size).toBe(4);
  });

  describe("facet_query", () => {
    it("executes facet DSL via rawQuery", async () => {
      client.rawQuery.mockResolvedValue({
        journal: [{ id: "1", name: "Nature", count: 42 }],
      });

      await callTool(handlers, "facet_query", {
        entityType: "publications",
        facetField: "journal",
        query: "CRISPR",
        limit: 10,
      });

      expect(client.rawQuery).toHaveBeenCalledTimes(1);
      const dsl = client.rawQuery.mock.calls[0][0] as string;
      expect(dsl).toContain("search publications");
      expect(dsl).toContain('for "CRISPR"');
      expect(dsl).toContain("journal");
    });

    it("formats buckets result", async () => {
      const mockBuckets = [
        { id: "1", name: "Nature", count: 42 },
        { id: "2", name: "Science", count: 38 },
      ];
      client.rawQuery.mockResolvedValue({ journal: mockBuckets });

      const result = await callTool(handlers, "facet_query", {
        entityType: "publications",
        facetField: "journal",
        limit: 20,
      });
      const parsed = parseToolResult(result);

      expect(parsed.entityType).toBe("publications");
      expect(parsed.facetField).toBe("journal");
      expect(parsed.totalBuckets).toBe(2);
      expect(parsed.buckets).toEqual(mockBuckets);
    });

    it("resolves facetField alias via withFieldAliases", async () => {
      client.rawQuery.mockResolvedValue({ category_for: [] });

      await callTool(handlers, "facet_query", {
        entityType: "publications",
        facetField: "fields_of_research",
        limit: 10,
      });

      const dsl = client.rawQuery.mock.calls[0][0] as string;
      expect(dsl).toContain("category_for");
    });

    it("applies yearFrom filter", async () => {
      client.rawQuery.mockResolvedValue({ journal: [{ id: "1", name: "Nature", count: 1 }] });

      await callTool(handlers, "facet_query", {
        entityType: "publications",
        facetField: "journal",
        query: "machine learning",
        yearFrom: 2020,
        limit: 20,
      });

      const dsl = client.rawQuery.mock.calls[0][0] as string;
      expect(dsl).toContain("year >= 2020");
      expect(dsl).toContain("return journal");
    });

    it("resolves funders facet alias to funder_orgs on grants", async () => {
      client.rawQuery.mockResolvedValue({ funder_orgs: [{ id: "grid.1", count: 1 }] });

      await callTool(handlers, "facet_query", {
        entityType: "grants",
        facetField: "funders",
        query: "climate",
        limit: 10,
      });

      const dsl = client.rawQuery.mock.calls[0][0] as string;
      expect(dsl).toContain("return funder_orgs");
    });

    it("handles errors gracefully", async () => {
      client.rawQuery.mockRejectedValue(new Error("API rate limit exceeded"));

      const result = await callTool(handlers, "facet_query", {
        entityType: "publications",
        facetField: "journal",
        limit: 10,
      });

      expect(result.isError).toBe(true);
      const parsed = parseToolResult(result);
      expect(parsed.error).toBe("API rate limit exceeded");
      expect(parsed.type).toBe("Error");
    });
  });

  describe("aggregate_query", () => {
    it("executes aggregate DSL via rawQuery", async () => {
      client.rawQuery.mockResolvedValue({
        journal: [{ id: "1", name: "Nature", count: 100, times_cited: 5000 }],
      });

      await callTool(handlers, "aggregate_query", {
        entityType: "publications",
        facetField: "journal",
        indicators: ["citations_total"],
        query: "cancer research",
        sortBy: "count",
        sortOrder: "desc",
        limit: 15,
      });

      expect(client.rawQuery).toHaveBeenCalledTimes(1);
      const dsl = client.rawQuery.mock.calls[0][0] as string;
      expect(dsl).toContain("search publications");
      expect(dsl).toContain("citations_total");
    });

    it("formats aggregate result", async () => {
      const mockBuckets = [{ id: "1", name: "NIH", count: 100 }];
      client.rawQuery.mockResolvedValue({ funder_orgs: mockBuckets });

      const result = await callTool(handlers, "aggregate_query", {
        entityType: "grants",
        facetField: "funder_orgs",
        indicators: ["count"],
        limit: 20,
      });
      const parsed = parseToolResult(result);

      expect(parsed.entityType).toBe("grants");
      expect(parsed.facetField).toBe("funder_orgs");
      expect(parsed.indicators).toEqual(["count"]);
      expect(parsed.totalBuckets).toBe(1);
      expect(parsed.buckets).toEqual(mockBuckets);
    });

    it("resolves indicator aliases", async () => {
      client.rawQuery.mockResolvedValue({ journal: [] });

      await callTool(handlers, "aggregate_query", {
        entityType: "publications",
        facetField: "journal",
        indicators: ["field_citation_ratio_avg"],
        limit: 10,
      });

      const dsl = client.rawQuery.mock.calls[0][0] as string;
      expect(dsl).toContain("fcr_gavg");
    });

    it("applies yearFrom on aggregate queries", async () => {
      client.rawQuery.mockResolvedValue({ funder_orgs: [] });

      await callTool(handlers, "aggregate_query", {
        entityType: "grants",
        facetField: "funder_orgs",
        indicators: ["funding"],
        query: "climate adaptation",
        yearFrom: 2018,
        limit: 10,
      });

      const dsl = client.rawQuery.mock.calls[0][0] as string;
      expect(dsl).toContain("start_year >= 2018");
      expect(dsl).toContain("aggregate funding");
    });

    it("resolves funders facet alias on aggregate queries", async () => {
      client.rawQuery.mockResolvedValue({ funder_orgs: [] });

      await callTool(handlers, "aggregate_query", {
        entityType: "grants",
        facetField: "funders",
        indicators: ["funding"],
        limit: 10,
      });

      const dsl = client.rawQuery.mock.calls[0][0] as string;
      expect(dsl).toContain("return funder_orgs aggregate funding");
    });

    it("handles errors gracefully", async () => {
      client.rawQuery.mockRejectedValue(new Error("Invalid indicator"));

      const result = await callTool(handlers, "aggregate_query", {
        entityType: "publications",
        facetField: "journal",
        indicators: ["citations_total"],
        limit: 10,
      });

      expect(result.isError).toBe(true);
      const parsed = parseToolResult(result);
      expect(parsed.error).toBe("Invalid indicator");
    });
  });

  describe("citation_trend", () => {
    it("calls rawQuery with QueryBuilder-generated DSL", async () => {
      client.rawQuery.mockResolvedValue({
        citations_per_year: [{ year: 2020, count: 100 }],
      });

      await callTool(handlers, "citation_trend", {
        query: "CRISPR",
        startYear: 2018,
        endYear: 2022,
      });

      expect(client.rawQuery).toHaveBeenCalledTimes(1);
      const dsl = client.rawQuery.mock.calls[0][0] as string;
      expect(dsl).toContain("search publications");
      expect(dsl).toContain("CRISPR");
      expect(dsl).toContain("citations_per_year");
    });

    it("formats citations_per_year result", async () => {
      const mockData = [
        { year: 2020, count: 100 },
        { year: 2021, count: 150 },
      ];
      client.rawQuery.mockResolvedValue({ citations_per_year: mockData });

      const result = await callTool(handlers, "citation_trend", {
        query: "CRISPR",
        startYear: 2020,
        endYear: 2021,
      });
      const parsed = parseToolResult(result);

      expect(parsed.query).toBe("CRISPR");
      expect(parsed.startYear).toBe(2020);
      expect(parsed.endYear).toBe(2021);
      expect(parsed.citationsPerYear).toEqual(mockData);
    });

    it("handles undefined response key with empty array", async () => {
      client.rawQuery.mockResolvedValue({});

      const result = await callTool(handlers, "citation_trend", {
        query: "CRISPR",
        startYear: 2020,
        endYear: 2022,
      });
      const parsed = parseToolResult(result);

      expect(parsed.citationsPerYear).toEqual([]);
    });

    it("normalizes citations_per_year year map from API", async () => {
      client.rawQuery.mockResolvedValue({
        citations_per_year: { 2018: 100, 2020: 300, 2019: 200 },
      });

      const result = await callTool(handlers, "citation_trend", {
        query: "large language model",
        startYear: 2018,
        endYear: 2020,
      });
      const parsed = parseToolResult(result);

      expect(parsed.citationsPerYear).toEqual([
        { year: 2018, count: 100 },
        { year: 2019, count: 200 },
        { year: 2020, count: 300 },
      ]);
    });

    it("returns error when startYear > endYear", async () => {
      const result = await callTool(handlers, "citation_trend", {
        query: "CRISPR",
        startYear: 2025,
        endYear: 2020,
      });

      expect(result.isError).toBe(true);
      const parsed = parseToolResult(result);
      expect(parsed.error).toContain("startYear");
      expect(parsed.error).toContain("endYear");
    });

    it("handles errors gracefully", async () => {
      client.rawQuery.mockRejectedValue(new Error("Query timeout"));

      const result = await callTool(handlers, "citation_trend", {
        query: "CRISPR",
        startYear: 2020,
        endYear: 2022,
      });

      expect(result.isError).toBe(true);
      const parsed = parseToolResult(result);
      expect(parsed.error).toBe("Query timeout");
    });
  });

  describe("funding_trend", () => {
    it("returns error when startYear > endYear", async () => {
      const result = await callTool(handlers, "funding_trend", {
        query: "cancer",
        startYear: 2025,
        endYear: 2020,
        currency: "USD",
      });

      expect(result.isError).toBe(true);
      const parsed = parseToolResult(result);
      expect(parsed.error).toContain("startYear");
      expect(parsed.error).toContain("endYear");
    });

    it("calls rawQuery with grants DSL", async () => {
      client.rawQuery.mockResolvedValue({
        funding_per_year: [{ year: 2022, amount: 1000000 }],
      });

      await callTool(handlers, "funding_trend", {
        query: "cancer immunotherapy",
        startYear: 2020,
        endYear: 2024,
        currency: "EUR",
      });

      expect(client.rawQuery).toHaveBeenCalledTimes(1);
      const dsl = client.rawQuery.mock.calls[0][0] as string;
      expect(dsl).toContain("search grants");
      expect(dsl).toContain("cancer immunotherapy");
      expect(dsl).toContain("funding_per_year");
    });

    it("formats funding_per_year with currency", async () => {
      const mockData = [{ year: 2022, amount: 1000000 }];
      client.rawQuery.mockResolvedValue({ funding_per_year: mockData });

      const result = await callTool(handlers, "funding_trend", {
        query: "cancer",
        startYear: 2022,
        endYear: 2022,
        currency: "GBP",
      });
      const parsed = parseToolResult(result);

      expect(parsed.query).toBe("cancer");
      expect(parsed.startYear).toBe(2022);
      expect(parsed.endYear).toBe(2022);
      expect(parsed.currency).toBe("GBP");
      expect(parsed.fundingPerYear).toEqual(mockData);
    });

    it("handles undefined response key with empty array", async () => {
      client.rawQuery.mockResolvedValue({});

      const result = await callTool(handlers, "funding_trend", {
        query: "cancer",
        startYear: 2020,
        endYear: 2022,
        currency: "USD",
      });
      const parsed = parseToolResult(result);

      expect(parsed.fundingPerYear).toEqual([]);
    });

    it("handles errors gracefully", async () => {
      client.rawQuery.mockRejectedValue(new Error("Connection refused"));

      const result = await callTool(handlers, "funding_trend", {
        query: "cancer",
        startYear: 2020,
        endYear: 2022,
        currency: "USD",
      });

      expect(result.isError).toBe(true);
      const parsed = parseToolResult(result);
      expect(parsed.error).toBe("Connection refused");
    });
  });
});
