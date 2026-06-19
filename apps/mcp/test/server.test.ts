/**
 * Tests for the MCP server factory function and startup lifecycle.
 * @module test/server
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildServerInstructions,
  createMcpServerAsync,
  startMcpServer,
} from "../src/mcp/server.js";
import { testSchemaStore } from "./helpers/schema-fixture.js";

describe("createMcpServerAsync", () => {
  const originalEnv = process.env.DIMENSIONS_API_KEY;

  beforeEach(() => {
    delete process.env.DIMENSIONS_API_KEY;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.DIMENSIONS_API_KEY = originalEnv;
    } else {
      delete process.env.DIMENSIONS_API_KEY;
    }
  });

  it("throws when no API key is provided via config or env", async () => {
    await expect(createMcpServerAsync()).rejects.toThrow("Dimensions API key required");
  });

  it("accepts API key via config parameter", async () => {
    const { server } = await createMcpServerAsync({
      apiKey: "test-key-123",
      schemaStore: testSchemaStore(),
    });
    expect(server).toBeDefined();
  });

  it("accepts API key via environment variable", async () => {
    process.env.DIMENSIONS_API_KEY = "env-key-456";
    const { server } = await createMcpServerAsync({ schemaStore: testSchemaStore() });
    expect(server).toBeDefined();
  });

  it("returns a configured McpServer instance", async () => {
    const { server } = await createMcpServerAsync({
      apiKey: "test-key",
      schemaStore: testSchemaStore(),
    });
    expect(server.server).toBeDefined();
  });

  it("builds server instructions with agent routing hints", () => {
    const instructions = buildServerInstructions(testSchemaStore());
    expect(instructions).toContain("facet_query");
    expect(instructions).toContain("search_researchers matches names only");
    expect(instructions).toContain("research_orgs.id");
    expect(instructions).toContain("funder_orgs");
    expect(instructions).toContain("fetch_search_pages");
    expect(instructions).toContain("dimensions://schema/policy");
  });
});

describe("startMcpServer", () => {
  const originalApiKey = process.env.DIMENSIONS_API_KEY;

  beforeEach(() => {
    process.env.DIMENSIONS_API_KEY = "test-key-for-startup";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalApiKey !== undefined) {
      process.env.DIMENSIONS_API_KEY = originalApiKey;
    } else {
      delete process.env.DIMENSIONS_API_KEY;
    }
  });

  it("accepts an injected transport and returns a handle with close", async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    const handle = await startMcpServer(serverTransport, {
      apiKey: "test-key",
      schemaStore: testSchemaStore(),
    });

    const client = new Client({ name: "test-client", version: "1.0.0" });
    await client.connect(clientTransport);

    expect(handle).toBeDefined();
    expect(typeof handle.close).toBe("function");

    await client.close();
    await handle.close();
  });

  it("does not call process.exit when using injected transport", async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

    const handle = await startMcpServer(serverTransport, {
      apiKey: "test-key",
      schemaStore: testSchemaStore(),
    });

    const client = new Client({ name: "test-client", version: "1.0.0" });
    await client.connect(clientTransport);

    await client.close();
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(exitSpy).not.toHaveBeenCalled();
    await handle.close();
  });
});

describe("MCP protocol", () => {
  it("lists DSL tools and schema resources over in-memory transport", async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const handle = await startMcpServer(serverTransport, {
      apiKey: "test-key",
      schemaStore: testSchemaStore(),
    });

    const client = new Client({ name: "test-client", version: "1.0.0" });
    await client.connect(clientTransport);

    const tools = await client.listTools();
    const toolNames = tools.tools.map((t) => t.name);
    expect(toolNames).toContain("search_publications");
    expect(toolNames).toContain("fetch_search_pages");
    expect(toolNames).toContain("execute_dsl");
    expect(toolNames).not.toContain("validate_dsl");

    const resources = await client.listResources();
    const uris = resources.resources.map((r) => r.uri);
    expect(uris.some((u) => u.startsWith("dimensions://schema"))).toBe(true);

    const schemaResource = await client.readResource({ uri: "dimensions://schema" });
    expect(schemaResource.contents.length).toBeGreaterThan(0);

    await client.close();
    await handle.close();
  });

  it("calls describe_schema via in-memory transport", async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const handle = await startMcpServer(serverTransport, {
      apiKey: "test-key",
      schemaStore: testSchemaStore(),
    });

    const client = new Client({ name: "test-client", version: "1.0.0" });
    await client.connect(clientTransport);

    const result = await client.callTool({
      name: "describe_schema",
      arguments: {},
    });
    expect(result.isError).toBeFalsy();

    await client.close();
    await handle.close();
  });
});
