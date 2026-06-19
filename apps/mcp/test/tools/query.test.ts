/**
 * Tests for the query MCP tools (execute_dsl).
 * Validates raw DSL passthrough, response forwarding, and error handling.
 * @module test/tools/query
 */

import { beforeEach, describe, expect, it } from "vitest";
import { registerQueryTools } from "../../src/mcp/tools/query.js";
import { testSchemaStore } from "../helpers/schema-fixture.js";
import {
  callTool,
  createMockClient,
  createMockServer,
  parseToolResult,
} from "../helpers/tool-test-harness.js";

describe("query tools", () => {
  let handlers: ReturnType<typeof createMockServer>["handlers"];
  let server: ReturnType<typeof createMockServer>["server"];
  let client: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    ({ server, handlers } = createMockServer());
    client = createMockClient();
    registerQueryTools(server as never, client as never, testSchemaStore());
  });

  describe("execute_dsl", () => {
    it("passes raw DSL query through to client", async () => {
      const dsl = 'search publications for "test" return publications limit 5';
      client.rawQuery.mockResolvedValueOnce({ publications: [] });

      await callTool(handlers, "execute_dsl", { dsl });

      expect(client.rawQuery).toHaveBeenCalledTimes(1);
      expect(client.rawQuery).toHaveBeenCalledWith(dsl);
    });

    it("returns raw response from client", async () => {
      const mockResponse = {
        publications: [{ id: "pub.1", title: "Test Paper", times_cited: 42 }],
        _stats: { total_count: 1 },
      };
      client.rawQuery.mockResolvedValueOnce(mockResponse);

      const result = await callTool(handlers, "execute_dsl", {
        dsl: 'search publications for "test" return publications limit 5',
      });
      const data = parseToolResult(result);

      expect(data.result).toEqual(mockResponse);
      expect(result.isError).toBeUndefined();
    });

    it("requires confirmLargeFetch for deep DSL pagination", async () => {
      const result = await callTool(handlers, "execute_dsl", {
        dsl: 'search publications for "ml" return publications limit 100 skip 5000',
      });
      expect(result.isError).toBe(true);
      expect(parseToolResult(result).error).toContain("confirmLargeFetch");
    });

    it("rejects skip on facet queries", async () => {
      const result = await callTool(handlers, "execute_dsl", {
        dsl: 'search publications for "ml" return year limit 20 skip 50',
      });
      expect(result.isError).toBe(true);
      expect(parseToolResult(result).error).toContain("Facet queries cannot be paginated");
    });

    it("adds policy hints for large truncated results", async () => {
      client.rawQuery.mockResolvedValueOnce({
        publications: [{ id: "pub.1" }],
        _stats: { total_count: 12_000 },
      });

      const result = await callTool(handlers, "execute_dsl", {
        dsl: 'search publications for "ml" return publications limit 1',
      });
      const data = parseToolResult(result);

      expect(data.largeResultWarning).toBeDefined();
      expect(data.paginationHint).toContain("12");
      expect(data.policyNotice).toBeDefined();
    });

    it("handles errors gracefully", async () => {
      client.rawQuery.mockRejectedValueOnce(new Error("Query syntax error"));

      const result = await callTool(handlers, "execute_dsl", {
        dsl: "invalid query",
      });
      const data = parseToolResult(result);

      expect(result.isError).toBe(true);
      expect(data.error).toBe("Query syntax error");
      expect(data.type).toBe("Error");
    });
  });
});
