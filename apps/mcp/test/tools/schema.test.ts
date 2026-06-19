/**
 * Tests for schema MCP tools.
 * @module test/tools/schema
 */

import { describe, expect, it } from "vitest";
import { registerSchemaTools } from "../../src/mcp/tools/schema.js";
import { testSchemaStore } from "../helpers/schema-fixture.js";
import { callTool, createMockClient, createMockServer } from "../helpers/tool-test-harness.js";

describe("schema tools", () => {
  const schemaStore = testSchemaStore();
  const context = { store: schemaStore };
  const client = createMockClient();
  const { server, handlers } = createMockServer();

  registerSchemaTools(server as never, client as never, context);

  it("describe_schema returns summary by default", async () => {
    const result = await callTool(handlers, "describe_schema", {});
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content[0].text) as Record<string, unknown>;
    expect(parsed.summary).toBeDefined();
    expect(parsed.schema).toBeUndefined();
    const summary = parsed.summary as Record<string, unknown>;
    expect(summary.resources).toBeDefined();
    expect(summary.stats).toBeDefined();
  });

  it("describe_schema returns full schema when full=true", async () => {
    const result = await callTool(handlers, "describe_schema", { full: true });
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content[0].text) as Record<string, unknown>;
    expect(parsed.schema).toBeDefined();
    expect(parsed.summary).toBeUndefined();
  });
});
