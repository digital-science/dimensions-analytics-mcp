/**
 * Hosted MCP end-to-end tests with mocked auth and dsl-service backends.
 * Runs in default CI without secrets.
 * @module test/integration/hosted.e2e
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { HostedEnvConfig } from "../../src/client/deployment-config.js";
import { clearSchemaCache } from "../../src/dsl/schema/index.js";
import type { HostedHttpServerHandle } from "../../src/mcp/http-server.js";
import { startHostedHttpServer } from "../../src/mcp/http-server.js";
import { clearSharedSchemaStore } from "../../src/mcp/shared-schema.js";
import { runEvalsWithClient } from "./harness.js";
import { checkHostedHealth, connectHostedMcpClient } from "./hosted-client.js";
import { installHostedServiceMocks } from "./hosted-mocks.js";
import { hostedSmokeSuite } from "./suites/hosted-smoke.integration.js";

const MOCK_HOSTED: HostedEnvConfig = {
  deploymentMode: "hosted",
  radarAuthUrl: "https://app.test.example",
  internal: {
    serviceUrl: "https://dsl.test.example",
    username: "svc-user",
    password: "svc-pass",
    dslSchema: "external",
    host: "app.test.example",
    variant: "standard",
  },
  httpPort: 8080,
};

const TEST_API_KEY = "test-hosted-api-key";

describe("Hosted MCP e2e (mocked backends)", () => {
  let restoreFetch: (() => void) | undefined;
  let server: HostedHttpServerHandle | undefined;
  let baseUrl: string;

  beforeEach(async () => {
    clearSharedSchemaStore();
    clearSchemaCache();

    restoreFetch = installHostedServiceMocks({
      authUrl: MOCK_HOSTED.radarAuthUrl,
      dslServiceUrl: MOCK_HOSTED.internal.serviceUrl,
      validApiKeys: [TEST_API_KEY],
      userEmail: "user@test.example",
    });

    server = startHostedHttpServer({
      hosted: MOCK_HOSTED,
      port: 0,
      bindHost: "127.0.0.1",
    });
    const port = await server.ready;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterEach(async () => {
    await server?.close();
    restoreFetch?.();
  });

  it("responds to GET /health", async () => {
    const response = await checkHostedHealth(baseUrl);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });

  it("returns 401 for POST /mcp without Authorization", async () => {
    const response = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "initialize", id: 1, params: {} }),
    });
    expect(response.status).toBe(401);
  });

  it("omits fetch_search_pages from the hosted tool surface", async () => {
    const session = await connectHostedMcpClient({ baseUrl, apiKey: TEST_API_KEY });
    try {
      const tools = await session.client.listTools();
      const names = tools.tools.map((tool) => tool.name);
      expect(names).not.toContain("fetch_search_pages");
      expect(names).toContain("search_publications");
    } finally {
      await session.close();
    }
  });

  it("runs hosted smoke eval cases over Streamable HTTP", async () => {
    const session = await connectHostedMcpClient({ baseUrl, apiKey: TEST_API_KEY });
    try {
      const result = await runEvalsWithClient(session.client, [hostedSmokeSuite]);
      expect(result.totalFailed).toBe(0);
      expect(result.totalPassed).toBe(hostedSmokeSuite.cases.length);
    } finally {
      await session.close();
    }
  });
});
