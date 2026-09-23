#!/usr/bin/env node
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { unpackExtension } from "@anthropic-ai/mcpb";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

const root = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const output = join(root, "dist/dimensions-analytics-mcp.mcpb");
const temp = mkdtempSync(join(tmpdir(), "dimensions-mcpb-smoke-"));
const client = new Client({ name: "mcpb-smoke", version: "1.0.0" });

try {
  if (!(await unpackExtension({ mcpbPath: output, outputDir: temp, silent: true }))) {
    throw new Error("Could not unpack the MCPB");
  }
  const manifest = JSON.parse(readFileSync(join(temp, "manifest.json"), "utf8"));
  const pkg = JSON.parse(readFileSync(join(root, "apps/mcp/package.json"), "utf8"));
  if (manifest.version !== pkg.version) throw new Error("Bundle version differs from package");
  const fixture = JSON.parse(
    readFileSync(join(root, "apps/mcp/test/fixtures/describe-schema.json"), "utf8"),
  );
  const cache = join(temp, "schema.json");
  writeFileSync(cache, JSON.stringify({ cachedAt: new Date().toISOString(), schema: fixture }));

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [join(temp, manifest.server.entry_point)],
    env: {
      ...process.env,
      DIMENSIONS_API_KEY: "smoke-test-key",
      DIMENSIONS_MCP_UPDATE_CHECK: "0",
      DIMENSIONS_MCP_AUTO_UPDATE: "0",
      SCHEMA_CACHE_PATH: cache,
    },
  });
  const timeout = setTimeout(() => {
    console.error("MCPB smoke test timed out");
    process.exitCode = 1;
    void transport.close();
  }, 20_000);
  try {
    await client.connect(transport);
    const tools = await client.listTools();
    if (!tools.tools.some((tool) => tool.name === "search_publications")) {
      throw new Error("Bundled server did not expose search_publications");
    }
    console.log(`MCPB smoke test passed (${tools.tools.length} tools)`);
  } finally {
    clearTimeout(timeout);
    await client.close();
  }
} finally {
  rmSync(temp, { recursive: true, force: true });
}
