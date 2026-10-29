/**
 * Tests for the `searchIn` option on search_* and analytics tools (WEBAPPDEV-14092).
 * @module test/tools/search-index
 */

import { beforeEach, describe, expect, it } from "vitest";
import { registerAnalyticsTools } from "../../src/mcp/tools/analytics.js";
import { registerSearchTools } from "../../src/mcp/tools/search.js";
import { testSchemaStore } from "../helpers/schema-fixture.js";
import {
  callTool,
  createMockClient,
  createMockServer,
  parseToolResult,
} from "../helpers/tool-test-harness.js";

const PHRASE = '"solid-state batteries"';

describe("searchIn", () => {
  let handlers: ReturnType<typeof createMockServer>["handlers"];
  let client: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    const mock = createMockServer();
    handlers = mock.handlers;
    client = createMockClient();
    registerSearchTools(mock.server as never, client as never, testSchemaStore());
    registerAnalyticsTools(mock.server as never, client as never, testSchemaStore());
  });

  function lastDsl(): string {
    return client.rawQuery.mock.calls.at(-1)?.[0] as string;
  }

  describe("search tools", () => {
    it("searches publications in the given index", async () => {
      client.rawQuery.mockResolvedValue({ publications: [], _stats: { total_count: 10536 } });

      const result = await callTool(handlers, "search_publications", {
        query: PHRASE,
        yearFrom: 2016,
        yearTo: 2025,
        searchIn: "title_abstract_only",
        limit: 1,
      });

      expect(parseToolResult(result).totalCount).toBe(10536);
      expect(lastDsl()).toMatch(
        /^search publications in title_abstract_only for "\\"solid-state batteries\\"" where year >= 2016 and year <= 2025 return publications/,
      );
    });

    it("searches grants in the given index", async () => {
      client.rawQuery.mockResolvedValue({ grants: [], _stats: { total_count: 0 } });

      await callTool(handlers, "search_grants", {
        query: PHRASE,
        searchIn: "title_abstract_only",
        limit: 1,
      });

      expect(lastDsl()).toContain("search grants in title_abstract_only for");
    });

    it("leaves the DSL unchanged when searchIn is omitted", async () => {
      client.rawQuery.mockResolvedValue({ publications: [], _stats: { total_count: 0 } });

      await callTool(handlers, "search_publications", { query: PHRASE, limit: 1 });

      expect(lastDsl()).toMatch(/^search publications for "/);
    });
  });

  describe("analytics tools", () => {
    it.each([
      ["facet_query", { entityType: "publications", facetField: "journal", limit: 10 }],
      [
        "aggregate_query",
        {
          entityType: "publications",
          facetField: "journal",
          indicators: ["citations_total"],
          limit: 10,
        },
      ],
      ["citation_trend", { startYear: 2016, endYear: 2025 }],
      ["funding_trend", { startYear: 2016, endYear: 2025, currency: "USD" }],
    ])("%s searches in the given index", async (tool, args) => {
      await callTool(handlers, tool, { ...args, query: PHRASE, searchIn: "title_abstract_only" });

      expect(client.rawQuery).toHaveBeenCalledTimes(1);
      expect(lastDsl()).toContain("in title_abstract_only for");
    });

    it("returns facet buckets for the restricted search", async () => {
      client.rawQuery.mockResolvedValue({ journal: [{ id: "jour.1", count: 812 }] });

      const result = await callTool(handlers, "facet_query", {
        entityType: "publications",
        facetField: "journal",
        query: PHRASE,
        searchIn: "title_abstract_only",
        limit: 10,
      });

      expect(parseToolResult(result).buckets).toEqual([
        expect.objectContaining({ id: "jour.1", count: 812 }),
      ]);
    });
  });

  describe("invalid use", () => {
    it("names the valid indexes when the index does not exist for the entity", async () => {
      const result = await callTool(handlers, "search_grants", {
        query: PHRASE,
        searchIn: "authors",
        limit: 1,
      });

      expect(result.isError).toBe(true);
      const parsed = parseToolResult(result);
      expect(parsed.type).toBe("ValidationError");
      expect(parsed.error).toContain('Invalid search index "authors" for grants');
      expect(parsed.error).toContain("title_abstract_only");
      expect(client.rawQuery).not.toHaveBeenCalled();
    });

    it("requires a query on search tools", async () => {
      const result = await callTool(handlers, "search_publications", {
        searchIn: "title_abstract_only",
        yearFrom: 2020,
        limit: 1,
      });

      expect(result.isError).toBe(true);
      expect(parseToolResult(result).error).toContain("requires a query");
      expect(client.rawQuery).not.toHaveBeenCalled();
    });

    it("requires a query on facet_query", async () => {
      const result = await callTool(handlers, "facet_query", {
        entityType: "publications",
        facetField: "journal",
        searchIn: "title_abstract_only",
        limit: 10,
      });

      expect(result.isError).toBe(true);
      expect(parseToolResult(result).error).toContain("requires a query");
      expect(client.rawQuery).not.toHaveBeenCalled();
    });

    it("rejects an invalid index on citation_trend before calling the API", async () => {
      const result = await callTool(handlers, "citation_trend", {
        query: PHRASE,
        searchIn: "investigators",
        startYear: 2016,
        endYear: 2025,
      });

      expect(result.isError).toBe(true);
      expect(parseToolResult(result).error).toContain("Valid indexes:");
      expect(client.rawQuery).not.toHaveBeenCalled();
    });
  });
});
