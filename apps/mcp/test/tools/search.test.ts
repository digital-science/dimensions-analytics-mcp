/**
 * Tests for search MCP tools.
 * Verifies schema-driven registration, rawQuery DSL execution, and result formatting.
 * @module test/tools/search
 */

import { beforeEach, describe, expect, it } from "vitest";
import { registerSearchTools } from "../../src/mcp/tools/search.js";
import { testSchemaStore } from "../helpers/schema-fixture.js";
import {
  callTool,
  createMockClient,
  createMockServer,
  parseToolResult,
} from "../helpers/tool-test-harness.js";

/** API-shaped mock response for parseEntityResponse. */
function apiRows(
  entity: string,
  rows: Record<string, unknown>[],
  totalCount?: number,
): Record<string, unknown> {
  return {
    [entity]: rows,
    _stats: { total_count: totalCount ?? rows.length },
  };
}

describe("search tools", () => {
  let handlers: ReturnType<typeof createMockServer>["handlers"];
  let server: ReturnType<typeof createMockServer>["server"];
  let client: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    ({ server, handlers } = createMockServer());
    client = createMockClient();
    registerSearchTools(server as never, client as never, testSchemaStore());
  });

  it("registers all 8 search tools", () => {
    const expectedTools = [
      "search_publications",
      "search_grants",
      "search_researchers",
      "search_patents",
      "search_clinical_trials",
      "search_datasets",
      "search_policy_documents",
      "search_organizations",
    ];
    for (const name of expectedTools) {
      expect(handlers.has(name)).toBe(true);
    }
    expect(handlers.size).toBe(8);
  });

  describe("search_publications", () => {
    it("executes DSL via rawQuery with convenience filters", async () => {
      client.rawQuery.mockResolvedValue(
        apiRows(
          "publications",
          [
            { id: "pub1", title: "Paper A" },
            { id: "pub2", title: "Paper B" },
          ],
          5,
        ),
      );

      await callTool(handlers, "search_publications", {
        query: "CRISPR gene editing",
        yearFrom: 2020,
        yearTo: 2024,
        type: "article",
        limit: 50,
        sortBy: "times_cited",
        fields: ["id", "title", "doi"],
      });

      expect(client.rawQuery).toHaveBeenCalledTimes(1);
      const dsl = client.rawQuery.mock.calls[0][0] as string;
      expect(dsl).toContain("search publications");
      expect(dsl).toContain('for "CRISPR gene editing"');
      expect(dsl).toContain("year >= 2020");
      expect(dsl).toContain("year <= 2024");
      expect(dsl).toContain('type = "article"');
      expect(dsl).toContain("limit 50");
      expect(dsl).toContain("sort by times_cited desc");
    });

    it("formats result correctly", async () => {
      const mockPublications = [
        { id: "pub1", title: "Paper A" },
        { id: "pub2", title: "Paper B" },
      ];
      client.rawQuery.mockResolvedValue(apiRows("publications", mockPublications, 2));

      const result = await callTool(handlers, "search_publications", {
        query: "machine learning",
        limit: 100,
      });
      const parsed = parseToolResult(result);

      expect(parsed.totalCount).toBe(2);
      expect(parsed.returnedCount).toBe(2);
      expect(parsed.publications).toEqual(mockPublications);
    });

    it("uses default limit when not specified", async () => {
      client.rawQuery.mockResolvedValue(apiRows("publications", [], 0));

      const result = await callTool(handlers, "search_publications", {
        query: "quantum computing",
      });
      const parsed = parseToolResult(result);

      expect(parsed.totalCount).toBe(0);
      expect(parsed.returnedCount).toBe(0);
      expect(parsed.publications).toEqual([]);
      const dsl = client.rawQuery.mock.calls[0][0] as string;
      expect(dsl).toContain("limit 100");
    });

    it("handles errors gracefully", async () => {
      client.rawQuery.mockRejectedValue(new Error("API rate limit exceeded"));

      const result = await callTool(handlers, "search_publications", {
        query: "failing query",
        limit: 100,
      });

      expect(result.isError).toBe(true);
      const parsed = parseToolResult(result);
      expect(parsed.error).toBe("API rate limit exceeded");
      expect(parsed.type).toBe("Error");
    });
  });

  describe("search_grants", () => {
    it("builds grant DSL and formats result", async () => {
      const mockGrants = [{ id: "g1", title: "Cancer Research Grant" }];
      client.rawQuery.mockResolvedValue(apiRows("grants", mockGrants, 1));

      const result = await callTool(handlers, "search_grants", {
        query: "cancer research",
        startYearFrom: 2022,
        funderOrgName: "NIH",
        limit: 50,
        sortBy: "funding_usd",
        fields: ["id", "title", "funding_usd"],
      });

      const dsl = client.rawQuery.mock.calls[0][0] as string;
      expect(dsl).toContain("search grants");
      expect(dsl).toContain("start_year >= 2022");
      expect(dsl).toContain('funder_org_name = "National Institutes of Health"');

      const parsed = parseToolResult(result);
      expect(parsed.totalCount).toBe(1);
      expect(parsed.grants).toEqual(mockGrants);
    });

    it("resolves funder acronyms in funderOrgName", async () => {
      client.rawQuery.mockResolvedValue(apiRows("grants", [{ id: "g1" }], 1));

      await callTool(handlers, "search_grants", {
        query: "cancer immunotherapy",
        funderOrgName: "NCI",
        limit: 10,
      });

      const dsl = client.rawQuery.mock.calls[0][0] as string;
      expect(dsl).toContain('funder_org_name = "National Cancer Institute"');
    });

    it("handles errors gracefully", async () => {
      client.rawQuery.mockRejectedValue(new Error("Connection timeout"));

      const result = await callTool(handlers, "search_grants", {
        query: "failing query",
        limit: 100,
      });

      expect(result.isError).toBe(true);
      expect(parseToolResult(result).error).toBe("Connection timeout");
    });
  });

  describe("search_researchers", () => {
    it("describes name-oriented search in tool metadata", () => {
      const tool = server.registerTool.mock.calls.find((c) => c[0] === "search_researchers");
      expect(tool).toBeDefined();
      const description = tool?.[1]?.description as string;
      expect(description).toContain("name");
      expect(description).toContain("facet_query");
    });

    it("formats researcher results", async () => {
      const mockResearchers = [{ id: "r1", first_name: "Jennifer", last_name: "Doudna" }];
      client.rawQuery.mockResolvedValue(apiRows("researchers", mockResearchers, 1));

      const result = await callTool(handlers, "search_researchers", {
        query: "Jennifer Doudna",
        limit: 10,
        sortBy: "total_publications",
      });

      const parsed = parseToolResult(result);
      expect(parsed.researchers).toEqual(mockResearchers);
    });
  });

  describe("search_patents", () => {
    it("applies filing year filters", async () => {
      client.rawQuery.mockResolvedValue(apiRows("patents", [{ id: "p1" }], 1));

      await callTool(handlers, "search_patents", {
        query: "CRISPR",
        filingYearFrom: 2015,
        filingYearTo: 2020,
        limit: 10,
      });

      const dsl = client.rawQuery.mock.calls[0][0] as string;
      expect(dsl).toContain("year >= 2015");
      expect(dsl).toContain("year <= 2020");
    });
  });

  describe("search_clinical_trials", () => {
    it("returns clinicalTrials result key", async () => {
      client.rawQuery.mockResolvedValue(
        apiRows("clinical_trials", [{ id: "ct1", title: "Trial" }], 1),
      );

      const result = await callTool(handlers, "search_clinical_trials", {
        query: "diabetes",
        phase: "Phase 3",
        limit: 10,
      });
      const parsed = parseToolResult(result);
      expect(parsed.clinicalTrials).toHaveLength(1);
    });
  });

  describe("truncation warnings", () => {
    it("includes truncation warning when totalCount exceeds returnedCount", async () => {
      client.rawQuery.mockResolvedValue(
        apiRows(
          "publications",
          [
            { id: "pub1", title: "Paper A" },
            { id: "pub2", title: "Paper B" },
          ],
          5000,
        ),
      );

      const result = await callTool(handlers, "search_publications", {
        query: "machine learning",
        limit: 2,
      });
      const parsed = parseToolResult(result);

      expect(parsed.truncated).toBe(true);
      expect(parsed.truncationWarning as string).toContain("2 of 5000");
      expect(parsed.truncationWarning as string).toContain("fetch_search_pages");
      expect(parsed.pagination).toBeDefined();
      expect((parsed.pagination as { nextSkip: number }).nextSkip).toBe(2);
    });

    it("omits truncation fields when all results are returned", async () => {
      client.rawQuery.mockResolvedValue(
        apiRows(
          "publications",
          [
            { id: "pub1", title: "Paper A" },
            { id: "pub2", title: "Paper B" },
          ],
          2,
        ),
      );

      const result = await callTool(handlers, "search_publications", {
        query: "machine learning",
        limit: 100,
      });
      const parsed = parseToolResult(result);

      expect(parsed.truncated).toBeUndefined();
      expect(parsed.truncationWarning).toBeUndefined();
    });
  });

  describe("advanced filters", () => {
    it("includes extended filters in DSL", async () => {
      client.rawQuery.mockResolvedValue(
        apiRows("publications", [{ id: "pub1", title: "Filtered Paper" }], 1),
      );

      await callTool(handlers, "search_publications", {
        query: "CRISPR",
        limit: 100,
        filters: [{ field: "open_access", operator: "=", value: true }],
      });

      const dsl = client.rawQuery.mock.calls[0][0] as string;
      expect(dsl).toContain("open_access");
    });

    it("includes is_empty filter in DSL", async () => {
      client.rawQuery.mockResolvedValue(apiRows("publications", [], 0));

      await callTool(handlers, "search_publications", {
        query: "genomics",
        filters: [{ field: "doi", operator: "is_empty" }],
      });

      const dsl = client.rawQuery.mock.calls[0][0] as string;
      expect(dsl).toContain("is empty");
    });
  });

  describe("pagination", () => {
    it("applies skip to DSL", async () => {
      client.rawQuery.mockResolvedValue(apiRows("publications", [{ id: "pub.3" }], 100));

      await callTool(handlers, "search_publications", {
        query: "genomics",
        limit: 10,
        skip: 20,
      });

      const dsl = client.rawQuery.mock.calls[0][0] as string;
      expect(dsl).toContain("skip 20");
      expect(dsl).toContain("limit 10");
    });

    it("computes skip from page", async () => {
      client.rawQuery.mockResolvedValue(apiRows("publications", [], 0));

      await callTool(handlers, "search_publications", {
        query: "test",
        limit: 100,
        page: 3,
      });

      const dsl = client.rawQuery.mock.calls[0][0] as string;
      expect(dsl).toContain("skip 300");
    });

    it("requires confirmLargeFetch for deep pagination", async () => {
      const result = await callTool(handlers, "search_publications", {
        query: "genomics",
        limit: 100,
        skip: 5000,
      });
      expect(result.isError).toBe(true);
      expect(parseToolResult(result).error).toContain("confirmLargeFetch");
    });

    it("includes policyNotice when results are truncated", async () => {
      client.rawQuery.mockResolvedValue(apiRows("publications", [{ id: "pub.1" }], 5000));

      const result = await callTool(handlers, "search_publications", {
        query: "machine learning",
        limit: 1,
      });
      const parsed = parseToolResult(result);

      expect(parsed.policyNotice).toBeDefined();
    });

    it("includes largeResultWarning for very large totals", async () => {
      client.rawQuery.mockResolvedValue(apiRows("publications", [{ id: "pub.1" }], 25_000));

      const result = await callTool(handlers, "search_publications", {
        query: "broad",
        limit: 1,
      });
      const parsed = parseToolResult(result);

      expect(parsed.largeResultWarning).toBeDefined();
      expect(parsed.largeResultWarning as string).toContain("25,000");
    });
  });

  describe("field alias resolution", () => {
    it("resolves sortBy alias in DSL", async () => {
      client.rawQuery.mockResolvedValue(apiRows("publications", [{ id: "pub.1" }], 1));

      await callTool(handlers, "search_publications", {
        query: "test",
        sortBy: "total_citations",
      });

      const dsl = client.rawQuery.mock.calls[0][0] as string;
      expect(dsl).toContain("sort by times_cited");
      expect(dsl).not.toContain("total_citations");
    });

    it("resolves fields aliases in DSL", async () => {
      client.rawQuery.mockResolvedValue(apiRows("publications", [{ id: "pub.1" }], 1));

      await callTool(handlers, "search_publications", {
        query: "test",
        fields: ["total_citations", "title", "citation_ratio"],
      });

      const dsl = client.rawQuery.mock.calls[0][0] as string;
      expect(dsl).toContain("times_cited");
      expect(dsl).toContain("field_citation_ratio");
    });
  });
});
