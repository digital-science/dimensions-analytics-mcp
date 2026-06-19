#!/usr/bin/env node
/**
 * HTTP MCP server entry for hosted deployment (Streamable HTTP at /mcp).
 * @module http-main
 */

import { loadDeploymentConfig } from "./client/deployment-config.js";
import { startHostedHttpServer } from "./mcp/http-server.js";

const deployment = loadDeploymentConfig();
if (deployment.deploymentMode !== "hosted") {
  console.error("http-main requires DEPLOYMENT_MODE=hosted");
  process.exit(1);
}

const { close, ready } = startHostedHttpServer({
  hosted: deployment,
  port: deployment.httpPort,
});

ready
  .then((port) => {
    console.error(`Dimensions Analytics MCP HTTP server listening on port ${port}`);
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Failed to start HTTP server: ${message}`);
    process.exit(1);
  });

async function shutdown(): Promise<void> {
  await close();
  process.exit(0);
}

process.on("SIGTERM", () => {
  void shutdown();
});
process.on("SIGINT", () => {
  void shutdown();
});
