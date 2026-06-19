#!/usr/bin/env node
/**
 * MCP server entry point.
 * Starts the Dimensions Analytics MCP server with stdio transport.
 * @module main
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServerAsync } from "./mcp/server.js";

let close: () => Promise<void>;

try {
  const { server } = await createMcpServerAsync();

  const transport = new StdioServerTransport();

  server.server.onerror = (error: Error) => console.error(`MCP server error: ${error.message}`);
  server.server.onclose = () => {
    process.exit(0);
  };

  await server.connect(transport);

  close = async () => {
    await server.close();
  };
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Failed to start MCP server: ${message}`);
  process.exit(1);
}

const shutdown = async () => {
  await close();
  process.exit(0);
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
