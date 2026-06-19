/**
 * Tests for the lookup MCP tools (get_by_doi, get_by_pmid, get_by_id).
 * @module test/tools/lookup
 */

import { beforeEach, describe, expect, it } from "vitest";
import { registerLookupTools } from "../../src/mcp/tools/lookup.js";
import {
  callTool,
  createMockClient,
  createMockServer,
  parseToolResult,
} from "../helpers/tool-test-harness.js";

describe("lookup tools", () => {
  let handlers: ReturnType<typeof createMockServer>["handlers"];
  let client: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    const { server, handlers: h } = createMockServer();
    client = createMockClient();
    handlers = h;
    registerLookupTools(server as never, client as never);
  });

  describe("get_by_doi", () => {
    it("generates correct DSL query", async () => {
      client.rawQuery.mockResolvedValueOnce({
        publications: [{ id: "pub.123", title: "Test Paper", doi: "10.1038/test" }],
      });

      await callTool(handlers, "get_by_doi", { doi: "10.1038/test" });

      const dsl = client.rawQuery.mock.calls[0][0] as string;
      expect(dsl).toContain('where doi = "10.1038/test"');
      expect(dsl).toContain("search publications");
      expect(dsl).toContain("limit 1");
    });

    it("escapes DOI in DSL query", async () => {
      client.rawQuery.mockResolvedValueOnce({ publications: [] });

      await callTool(handlers, "get_by_doi", { doi: '10.1038/"special' });

      const dsl = client.rawQuery.mock.calls[0][0] as string;
      expect(dsl).toContain('where doi = "10.1038/\\"special"');
    });

    it("includes custom fields when specified", async () => {
      client.rawQuery.mockResolvedValueOnce({
        publications: [{ id: "pub.123", title: "Test Paper" }],
      });

      await callTool(handlers, "get_by_doi", {
        doi: "10.1038/test",
        fields: ["id", "title"],
      });

      const dsl = client.rawQuery.mock.calls[0][0] as string;
      expect(dsl).toContain("publications[id+title]");
    });

    it("returns found publication when match exists", async () => {
      const pub = { id: "pub.123", title: "Test Paper", doi: "10.1038/test" };
      client.rawQuery.mockResolvedValueOnce({ publications: [pub] });

      const result = await callTool(handlers, "get_by_doi", { doi: "10.1038/test" });
      const data = parseToolResult(result);

      expect(data.found).toBe(true);
      expect(data.publication).toEqual(pub);
    });

    it("returns not-found when no publication matches", async () => {
      client.rawQuery.mockResolvedValueOnce({ publications: [] });

      const result = await callTool(handlers, "get_by_doi", { doi: "10.9999/nonexistent" });
      const data = parseToolResult(result);

      expect(data.found).toBe(false);
      expect(data.message).toContain("No publication found with DOI: 10.9999/nonexistent");
    });

    it("returns not-found when publications key is missing", async () => {
      client.rawQuery.mockResolvedValueOnce({});

      const result = await callTool(handlers, "get_by_doi", { doi: "10.9999/missing" });
      const data = parseToolResult(result);

      expect(data.found).toBe(false);
    });

    it("rejects invalid field names", async () => {
      const result = await callTool(handlers, "get_by_doi", {
        doi: "10.1038/test",
        fields: ["id]+title//"],
      });
      expect(result.isError).toBe(true);
      const parsed = parseToolResult(result);
      expect(parsed.error).toContain("Invalid field name");
      expect(client.rawQuery).not.toHaveBeenCalled();
    });

    it("handles errors gracefully", async () => {
      client.rawQuery.mockRejectedValueOnce(new Error("API rate limit exceeded"));

      const result = await callTool(handlers, "get_by_doi", { doi: "10.1038/test" });
      const data = parseToolResult(result);

      expect(result.isError).toBe(true);
      expect(data.error).toBe("API rate limit exceeded");
    });
  });

  describe("get_by_pmid", () => {
    it("generates correct DSL query", async () => {
      client.rawQuery.mockResolvedValueOnce({
        publications: [{ id: "pub.456", title: "PMID Paper", pmid: "23846567" }],
      });

      await callTool(handlers, "get_by_pmid", { pmid: "23846567" });

      const dsl = client.rawQuery.mock.calls[0][0] as string;
      expect(dsl).toContain('where pmid = "23846567"');
      expect(dsl).toContain("search publications");
      expect(dsl).toContain("limit 1");
    });

    it("returns found publication when match exists", async () => {
      const pub = { id: "pub.456", title: "PMID Paper", pmid: "23846567" };
      client.rawQuery.mockResolvedValueOnce({ publications: [pub] });

      const result = await callTool(handlers, "get_by_pmid", { pmid: "23846567" });
      const data = parseToolResult(result);

      expect(data.found).toBe(true);
      expect(data.publication).toEqual(pub);
    });

    it("returns not-found for unknown PMID", async () => {
      client.rawQuery.mockResolvedValueOnce({ publications: [] });

      const result = await callTool(handlers, "get_by_pmid", { pmid: "00000000" });
      const data = parseToolResult(result);

      expect(data.found).toBe(false);
      expect(data.message).toContain("No publication found with PMID: 00000000");
    });

    it("includes custom fields when specified", async () => {
      client.rawQuery.mockResolvedValueOnce({
        publications: [{ id: "pub.456", title: "PMID Paper" }],
      });

      await callTool(handlers, "get_by_pmid", {
        pmid: "23846567",
        fields: ["id", "title", "times_cited"],
      });

      const dsl = client.rawQuery.mock.calls[0][0] as string;
      expect(dsl).toContain("publications[id+title+times_cited]");
    });

    it("rejects invalid field names", async () => {
      const result = await callTool(handlers, "get_by_pmid", {
        pmid: "23846567",
        fields: ["id]+title//"],
      });
      expect(result.isError).toBe(true);
      const parsed = parseToolResult(result);
      expect(parsed.error).toContain("Invalid field name");
      expect(client.rawQuery).not.toHaveBeenCalled();
    });

    it("handles errors gracefully", async () => {
      client.rawQuery.mockRejectedValueOnce(new Error("Network failure"));

      const result = await callTool(handlers, "get_by_pmid", { pmid: "23846567" });
      const data = parseToolResult(result);

      expect(result.isError).toBe(true);
      expect(data.error).toBe("Network failure");
    });
  });

  describe("get_by_id", () => {
    it("uses entity type in DSL query", async () => {
      client.rawQuery.mockResolvedValueOnce({
        grants: [{ id: "grant.123", title: "Test Grant" }],
      });

      await callTool(handlers, "get_by_id", {
        entityType: "grants",
        id: "grant.123",
      });

      const dsl = client.rawQuery.mock.calls[0][0] as string;
      expect(dsl).toContain('search grants where id = "grant.123"');
      expect(dsl).toContain("return grants");
      expect(dsl).toContain("limit 1");
    });

    it("returns found entity with entityType", async () => {
      const entity = { id: "pat.789", title: "Test Patent" };
      client.rawQuery.mockResolvedValueOnce({ patents: [entity] });

      const result = await callTool(handlers, "get_by_id", {
        entityType: "patents",
        id: "pat.789",
      });
      const data = parseToolResult(result);

      expect(data.found).toBe(true);
      expect(data.entity).toEqual(entity);
      expect(data.entityType).toBe("patents");
    });

    it("includes singularized entity name in not-found message", async () => {
      client.rawQuery.mockResolvedValueOnce({ publications: [] });

      const result = await callTool(handlers, "get_by_id", {
        entityType: "publications",
        id: "pub.nonexistent",
      });
      const data = parseToolResult(result);

      expect(data.found).toBe(false);
      expect(data.message).toContain("No publication found with ID: pub.nonexistent");
    });

    it("singularizes other entity types in not-found message", async () => {
      client.rawQuery.mockResolvedValueOnce({ researchers: [] });

      const result = await callTool(handlers, "get_by_id", {
        entityType: "researchers",
        id: "res.nonexistent",
      });
      const data = parseToolResult(result);

      expect(data.found).toBe(false);
      expect(data.message).toContain("No researcher found with ID: res.nonexistent");
    });

    it("includes custom fields when specified", async () => {
      client.rawQuery.mockResolvedValueOnce({
        datasets: [{ id: "ds.100", title: "Test Dataset" }],
      });

      await callTool(handlers, "get_by_id", {
        entityType: "datasets",
        id: "ds.100",
        fields: ["id", "title", "year"],
      });

      const dsl = client.rawQuery.mock.calls[0][0] as string;
      expect(dsl).toContain("datasets[id+title+year]");
    });

    it("escapes ID in DSL query", async () => {
      client.rawQuery.mockResolvedValueOnce({ publications: [] });

      await callTool(handlers, "get_by_id", {
        entityType: "publications",
        id: 'pub."test',
      });

      const dsl = client.rawQuery.mock.calls[0][0] as string;
      expect(dsl).toContain('where id = "pub.\\"test"');
    });

    it("rejects invalid field names", async () => {
      const result = await callTool(handlers, "get_by_id", {
        entityType: "grants",
        id: "grant.123",
        fields: ["id]+title return publications//"],
      });
      expect(result.isError).toBe(true);
      const parsed = parseToolResult(result);
      expect(parsed.error).toContain("Invalid field name");
      expect(client.rawQuery).not.toHaveBeenCalled();
    });

    it("handles errors gracefully", async () => {
      client.rawQuery.mockRejectedValueOnce(new Error("Unauthorized"));

      const result = await callTool(handlers, "get_by_id", {
        entityType: "grants",
        id: "grant.123",
      });
      const data = parseToolResult(result);

      expect(result.isError).toBe(true);
      expect(data.error).toBe("Unauthorized");
    });
  });
});
