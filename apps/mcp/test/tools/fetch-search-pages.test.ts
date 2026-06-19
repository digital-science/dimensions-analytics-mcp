/**
 * Tests for fetch_search_pages MCP tool.
 * @module test/tools/fetch-search-pages
 */

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { registerFetchSearchPagesTools } from "../../src/mcp/tools/fetch-search-pages.js";
import { testSchemaStore } from "../helpers/schema-fixture.js";
import {
  callTool,
  createMockClient,
  createMockServer,
  parseToolResult,
} from "../helpers/tool-test-harness.js";

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

describe("fetch_search_pages", () => {
  let handlers: ReturnType<typeof createMockServer>["handlers"];
  let client: ReturnType<typeof createMockClient>;
  let tempDir: string;

  beforeEach(async () => {
    client = createMockClient();
    const { server, handlers: h } = createMockServer();
    registerFetchSearchPagesTools(server as never, client as never, testSchemaStore());
    handlers = h;
    tempDir = await mkdtemp(join(tmpdir(), "dimensions-analytics-mcp-fetch-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("registers fetch_search_pages tool", () => {
    expect(handlers.has("fetch_search_pages")).toBe(true);
  });

  describe("page mode", () => {
    it("returns one page with pagination metadata", async () => {
      client.rawQuery.mockResolvedValue(
        apiRows(
          "publications",
          [
            { id: "pub.3", title: "Page 2" },
            { id: "pub.4", title: "Page 2b" },
          ],
          5000,
        ),
      );

      const result = await callTool(handlers, "fetch_search_pages", {
        entityType: "publications",
        mode: "page",
        query: "machine learning",
        page: 1,
        pageSize: 2,
      });
      const parsed = parseToolResult(result);

      expect(parsed.mode).toBe("page");
      expect(parsed.returnedCount).toBe(2);
      expect(parsed.truncated).toBe(true);
      expect(parsed.pagination).toBeDefined();
      expect((parsed.pagination as { skip: number }).skip).toBe(2);

      const dsl = client.rawQuery.mock.calls[0][0] as string;
      expect(dsl).toContain("limit 2");
      expect(dsl).toContain("skip 2");
    });
  });

  describe("aggregate mode", () => {
    it("fetches multiple pages and returns summary only", async () => {
      client.rawQuery
        .mockResolvedValueOnce(apiRows("grants", [{ id: "g1", funding_usd: 100 }], 3))
        .mockResolvedValueOnce(apiRows("grants", [{ id: "g2", funding_usd: 200 }], 3))
        .mockResolvedValueOnce(apiRows("grants", [{ id: "g3", funding_usd: 300 }], 3));

      const result = await callTool(handlers, "fetch_search_pages", {
        entityType: "grants",
        mode: "aggregate",
        query: "cancer",
        pageSize: 1,
        maxPages: 3,
      });
      const parsed = parseToolResult(result);

      expect(parsed.mode).toBe("aggregate");
      expect(parsed.pagesFetched).toBe(3);
      expect(parsed.returnedCount).toBe(3);
      expect(parsed.aggregate).toEqual({
        ids: ["g1", "g2", "g3"],
        idsTruncated: false,
        totalFundingUsd: 600,
      });
      expect(client.rawQuery).toHaveBeenCalledTimes(3);
    });
  });

  describe("file mode", () => {
    it("writes JSONL and meta sidecar", async () => {
      client.rawQuery.mockResolvedValue(apiRows("publications", [{ id: "pub.1", title: "A" }], 1));

      const outputPath = join(tempDir, "results.jsonl");
      const result = await callTool(handlers, "fetch_search_pages", {
        entityType: "publications",
        mode: "file",
        query: "CRISPR",
        outputPath,
        pageSize: 1000,
        maxPages: 1,
      });
      const parsed = parseToolResult(result);

      expect(parsed.mode).toBe("file");
      expect(parsed.recordsWritten).toBe(1);
      expect(parsed.outputPath).toBe(outputPath);

      const lines = (await readFile(outputPath, "utf8")).trim().split("\n");
      expect(lines).toHaveLength(1);
      expect(JSON.parse(lines[0])).toEqual({ id: "pub.1", title: "A" });

      const meta = JSON.parse(await readFile(`${outputPath}.meta.json`, "utf8"));
      expect(meta.recordsWritten).toBe(1);
      expect(meta.entityType).toBe("publications");
    });

    it("writes CSV with header and respects fields order", async () => {
      client.rawQuery.mockResolvedValue(
        apiRows(
          "publications",
          [
            { id: "pub.1", title: "Alpha", year: 2024 },
            { id: "pub.2", title: "Beta", year: 2023 },
          ],
          2,
        ),
      );

      const outputPath = join(tempDir, "results.csv");
      const result = await callTool(handlers, "fetch_search_pages", {
        entityType: "publications",
        mode: "file",
        query: "CRISPR",
        outputPath,
        outputFormat: "csv",
        fields: ["title", "id"],
        pageSize: 1000,
        maxPages: 1,
      });
      const parsed = parseToolResult(result);

      expect(parsed.outputFormat).toBe("csv");
      const csv = await readFile(outputPath, "utf8");
      expect(csv).toContain("title,id,year\n");
      expect(csv).toContain("Alpha,pub.1,2024\n");

      const meta = JSON.parse(await readFile(`${outputPath}.meta.json`, "utf8"));
      expect(meta.format).toBe("csv");
      expect(meta.columns).toEqual(["title", "id", "year"]);
    });

    it("requires outputPath", async () => {
      const result = await callTool(handlers, "fetch_search_pages", {
        entityType: "publications",
        mode: "file",
        query: "test",
      });
      expect(result.isError).toBe(true);
      expect(parseToolResult(result).error).toContain("outputPath");
    });
  });

  describe("policy guardrails", () => {
    it("rejects large batch without confirmLargeFetch", async () => {
      const result = await callTool(handlers, "fetch_search_pages", {
        entityType: "publications",
        mode: "aggregate",
        query: "broad query",
        maxPages: 10,
        pageSize: 1000,
      });
      expect(result.isError).toBe(true);
      expect(parseToolResult(result).error).toContain("confirmLargeFetch");
    });
  });
});
