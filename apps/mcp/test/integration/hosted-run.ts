#!/usr/bin/env node
/**
 * Live hosted MCP integration smoke test runner.
 *
 * Starts an in-process HTTP server (unless HOSTED_MCP_BASE_URL is set) and
 * exercises hosted MCP over Streamable HTTP with a real API key and backends.
 *
 * Usage:
 *   node --import tsx apps/mcp/test/integration/hosted-run.ts
 *
 * @module test/integration/hosted-run
 */

import type { HostedHttpServerHandle } from "../../src/mcp/http-server.js";
import { startHostedHttpServer } from "../../src/mcp/http-server.js";
import { HOSTED_INTEGRATION_ENV_VARS, loadHostedIntegrationConfig } from "./env.js";
import { runEvalsWithClient } from "./harness.js";
import { checkHostedHealth, connectHostedMcpClient } from "./hosted-client.js";
import { exitCode, printReport } from "./reporter.js";
import { hostedSmokeSuite } from "./suites/hosted-smoke.integration.js";

async function resolveServerBaseUrl(
  config: NonNullable<ReturnType<typeof loadHostedIntegrationConfig>>,
): Promise<{ baseUrl: string; close?: () => Promise<void> }> {
  if (config.remoteBaseUrl) {
    console.error(`Using remote hosted MCP at ${config.remoteBaseUrl}`);
    return { baseUrl: config.remoteBaseUrl };
  }

  const handle: HostedHttpServerHandle = startHostedHttpServer({
    hosted: config.hosted,
    port: 0,
    bindHost: "127.0.0.1",
  });
  const port = await handle.ready;
  const baseUrl = `http://127.0.0.1:${port}`;
  console.error(`Started in-process hosted MCP at ${baseUrl}`);
  return {
    baseUrl,
    close: () => handle.close(),
  };
}

const config = loadHostedIntegrationConfig();
if (!config) {
  console.error(
    `Hosted integration smoke requires env vars: ${HOSTED_INTEGRATION_ENV_VARS.join(", ")}`,
  );
  process.exit(1);
}

let serverClose: (() => Promise<void>) | undefined;
let status = 1;

try {
  const { baseUrl, close } = await resolveServerBaseUrl(config);
  serverClose = close;

  const health = await checkHostedHealth(baseUrl);
  if (!health.ok) {
    throw new Error(`Health check failed: GET /health returned ${health.status}`);
  }

  const session = await connectHostedMcpClient({
    baseUrl,
    apiKey: config.apiKey,
  });

  try {
    console.error("Running hosted MCP smoke suite...\n");
    const result = await runEvalsWithClient(session.client, [hostedSmokeSuite]);
    printReport(result);
    status = exitCode(result);
  } finally {
    await session.close();
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  status = 1;
} finally {
  if (serverClose) {
    await serverClose();
  }
}

process.exit(status);
