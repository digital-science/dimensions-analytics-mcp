/**
 * Keeps the Claude Desktop extension's static tool list in step with the stdio server.
 * @module test/mcpb-manifest-tools
 */
import { readFileSync } from "node:fs";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { describe, expect, it } from "vitest";
import { startMcpServer } from "../src/mcp/server.js";
import { testSchemaStore } from "./helpers/schema-fixture.js";

const manifest = JSON.parse(
  readFileSync(new URL("../../../mcpb/manifest.json", import.meta.url), "utf8"),
) as { tools: Array<{ name: string }> };

// WEBAPPDEV-14090: the extension page lists tools from the manifest, so it must match the server.
describe("mcpb manifest tools", () => {
  it("lists exactly the tools the stdio server registers", async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const handle = await startMcpServer(serverTransport, {
      apiKey: "test-key",
      schemaStore: testSchemaStore(),
    });
    const client = new Client({ name: "manifest-test", version: "1.0.0" });
    await client.connect(clientTransport);
    try {
      const { tools } = await client.listTools();
      expect(manifest.tools.map((tool) => tool.name).sort()).toEqual(
        tools.map((tool) => tool.name).sort(),
      );
    } finally {
      await client.close();
      await handle.close();
    }
  });
});
