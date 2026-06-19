/**
 * Shared test harness for MCP tool handlers.
 * Captures tool registrations from register*Tools() functions and provides
 * helpers to invoke handlers directly without MCP SDK transport overhead.
 * @module test/helpers/tool-test-harness
 */

import { vi } from "vitest";
import { QueryBuilder } from "../../src/dsl/index.js";
import type { ToolResult } from "../../src/mcp/utils.js";
import { testSchemaStore } from "./schema-fixture.js";

/** Captured tool handler function signature. */
type ToolHandler = (
  args: Record<string, unknown>,
  extra?: Record<string, unknown>,
) => Promise<ToolResult>;

/**
 * Creates a mock McpServer that captures `.registerTool()` registrations into a Map.
 * @returns Object with the mock server and a Map of tool name to handler
 */
export function createMockServer() {
  const handlers = new Map<string, ToolHandler>();

  const registerTool = vi.fn((name: string, _config: unknown, handler: ToolHandler) => {
    handlers.set(name, (args, extra) => handler(args, extra));
  });

  const server = { registerTool };

  return { server, handlers };
}

/**
 * Creates a mock DimensionsClient with vi.fn() stubs for all methods
 * used by the tool handlers.
 * @returns Mock client with spyable methods
 */
export function createMockClient() {
  const schemaStore = testSchemaStore();
  const mockBuilder = {
    where: vi.fn().mockReturnThis(),
    fields: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    forSimilar: vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue({ totalCount: 0, data: [] }),
  };

  return {
    createQueryBuilder: vi.fn(() => new QueryBuilder(schemaStore)),
    attachSchemaStore: vi.fn(),
    rawQuery: vi.fn().mockResolvedValue({}),
    send: vi.fn().mockResolvedValue({}),
    classify: vi.fn().mockResolvedValue({}),
    extractConcepts: vi.fn().mockResolvedValue({ extracted_concepts: [] }),
    extractAffiliations: vi.fn().mockResolvedValue({ extracted_affiliations: [] }),
    extractGrants: vi.fn().mockResolvedValue({ extracted_grants: [] }),
    publications: vi.fn().mockReturnValue(mockBuilder),
    grants: vi.fn().mockReturnValue(mockBuilder),
    /** Access the fluent builder mock for assertions. */
    _builder: mockBuilder,
  };
}

/**
 * Invokes a captured tool handler by name.
 * @param handlers - Map of tool handlers from createMockServer()
 * @param name - Tool name to invoke
 * @param args - Arguments to pass to the handler
 * @returns The raw tool result
 */
export async function callTool(
  handlers: Map<string, ToolHandler>,
  name: string,
  args: Record<string, unknown> = {},
  extra?: Record<string, unknown>,
): Promise<ToolResult> {
  const handler = handlers.get(name);
  if (!handler) {
    throw new Error(`Tool "${name}" not registered. Available: ${[...handlers.keys()].join(", ")}`);
  }
  return handler(args, extra);
}

/**
 * Parses the JSON payload from a tool result envelope.
 * @param result - The raw tool result from callTool()
 * @returns Parsed JSON data from the text content
 */
export function parseToolResult(result: ToolResult): Record<string, unknown> {
  const text = result.content[0]?.text;
  if (!text) {
    throw new Error("Tool result has no text content");
  }
  return JSON.parse(text) as Record<string, unknown>;
}
