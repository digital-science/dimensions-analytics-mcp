/**
 * Tests for the similar_documents MCP tool.
 * @module test/tools/similar-documents
 */

import { beforeEach, describe, expect, it } from "vitest";
import { registerSimilarDocumentsTool } from "../../src/mcp/tools/similar-documents.js";
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

const SAMPLE_ABSTRACT =
  "After spinal cord injury, macrophages infiltrate the lesion site and contribute to both tissue damage and repair.";

describe("similar_documents tool", () => {
  let handlers: ReturnType<typeof createMockServer>["handlers"];
  let client: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    const { server, handlers: h } = createMockServer();
    client = createMockClient();
    handlers = h;
    registerSimilarDocumentsTool(server as never, client as never);
  });

  it("registers similar_documents", () => {
    expect(handlers.has("similar_documents")).toBe(true);
  });

  it("builds similar_documents DSL with default score sort and limit 20", async () => {
    client.rawQuery.mockResolvedValue(apiRows("publications", [{ id: "pub.1", title: "A" }], 1));

    await callTool(handlers, "similar_documents", {
      entityType: "publications",
      text: SAMPLE_ABSTRACT,
    });

    expect(client.rawQuery).toHaveBeenCalledTimes(1);
    const dsl = client.rawQuery.mock.calls[0][0] as string;
    expect(dsl).toContain("search publications for similar_documents(");
    expect(dsl).toContain(SAMPLE_ABSTRACT);
    expect(dsl).toContain("sort by score desc");
    expect(dsl).toContain("limit 20");
  });

  it("applies year filters on publications and custom limit/fields", async () => {
    client.rawQuery.mockResolvedValue(apiRows("publications", [], 0));

    await callTool(handlers, "similar_documents", {
      entityType: "publications",
      text: SAMPLE_ABSTRACT,
      yearFrom: 2018,
      yearTo: 2024,
      limit: 5,
      fields: ["id", "title", "year"],
    });

    const dsl = client.rawQuery.mock.calls[0][0] as string;
    expect(dsl).toContain("year >= 2018");
    expect(dsl).toContain("year <= 2024");
    expect(dsl).toContain("limit 5");
    expect(dsl).toContain("return publications[id+title+year]");
  });

  it("uses start_year for grants year filters", async () => {
    client.rawQuery.mockResolvedValue(apiRows("grants", [{ id: "grant.1" }], 1));

    await callTool(handlers, "similar_documents", {
      entityType: "grants",
      text: "Cancer immunotherapy CAR-T solid tumors",
      yearFrom: 2020,
      limit: 5,
      fields: ["id", "title"],
    });

    const dsl = client.rawQuery.mock.calls[0][0] as string;
    expect(dsl).toContain("search grants for similar_documents(");
    expect(dsl).toContain("start_year >= 2020");
    expect(dsl).toContain("return grants[id+title]");
  });

  it("formats publication results", async () => {
    const pubs = [
      { id: "pub.1", title: "Paper A" },
      { id: "pub.2", title: "Paper B" },
    ];
    client.rawQuery.mockResolvedValue(apiRows("publications", pubs, 2));

    const result = await callTool(handlers, "similar_documents", {
      entityType: "publications",
      text: SAMPLE_ABSTRACT,
      limit: 5,
    });
    const data = parseToolResult(result);

    expect(result.isError).toBeUndefined();
    expect(data.entityType).toBe("publications");
    expect(data.totalCount).toBe(2);
    expect(data.returnedCount).toBe(2);
    expect(data.publications).toEqual(pubs);
  });

  it("formats grant results", async () => {
    const grants = [{ id: "grant.1", title: "Grant A" }];
    client.rawQuery.mockResolvedValue(apiRows("grants", grants, 1));

    const result = await callTool(handlers, "similar_documents", {
      entityType: "grants",
      text: "Climate adaptation funding",
      limit: 5,
    });
    const data = parseToolResult(result);

    expect(data.entityType).toBe("grants");
    expect(data.grants).toEqual(grants);
    expect(data.publications).toBeUndefined();
  });

  it("applies extra filters", async () => {
    client.rawQuery.mockResolvedValue(apiRows("publications", [], 0));

    await callTool(handlers, "similar_documents", {
      entityType: "publications",
      text: SAMPLE_ABSTRACT,
      filters: [{ field: "type", operator: "=", value: "article" }],
      limit: 5,
    });

    const dsl = client.rawQuery.mock.calls[0][0] as string;
    expect(dsl).toContain('type = "article"');
  });

  it("escapes quotes in text", async () => {
    client.rawQuery.mockResolvedValue(apiRows("publications", [], 0));

    await callTool(handlers, "similar_documents", {
      entityType: "publications",
      text: 'Text with "quotes" inside',
      limit: 5,
    });

    const dsl = client.rawQuery.mock.calls[0][0] as string;
    expect(dsl).toContain('similar_documents("Text with \\"quotes\\" inside")');
  });

  it("handles API errors gracefully", async () => {
    client.rawQuery.mockRejectedValueOnce(new Error("Similarity search failed"));

    const result = await callTool(handlers, "similar_documents", {
      entityType: "publications",
      text: SAMPLE_ABSTRACT,
    });
    const data = parseToolResult(result);

    expect(result.isError).toBe(true);
    expect(data.error).toBe("Similarity search failed");
  });
});
