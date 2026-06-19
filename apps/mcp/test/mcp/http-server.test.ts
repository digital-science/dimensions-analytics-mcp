/**
 * Smoke tests for hosted HTTP MCP server.
 * @module test/mcp/http-server
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import type { HostedEnvConfig } from "../../src/client/deployment-config.js";
import { AuthenticationError } from "../../src/client/errors.js";
import { startHostedHttpServer } from "../../src/mcp/http-server.js";

const HOSTED: HostedEnvConfig = {
  deploymentMode: "hosted",
  radarAuthUrl: "https://app.example.com",
  internal: {
    serviceUrl: "https://dsl.example.com",
    username: "svc",
    password: "secret",
    dslSchema: "external",
    host: "app.example.com",
    variant: "standard",
  },
  httpPort: 8080,
};

vi.mock("../../src/mcp/server.js", () => ({
  warmHostedSchemaCache: vi.fn().mockResolvedValue({}),
  createMcpServerAsync: vi.fn().mockResolvedValue({
    server: {
      connect: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    },
  }),
}));

vi.mock("../../src/client/resolve-api-key-user.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/client/resolve-api-key-user.js")>();
  return {
    ...actual,
    resolveUserFromApiKey: vi.fn().mockResolvedValue("user@example.com"),
    parseBearerToken: vi.fn((header?: string) => {
      if (!header?.startsWith("Bearer ")) {
        throw new AuthenticationError("Missing Authorization header");
      }
      return header.slice("Bearer ".length);
    }),
  };
});

describe("startHostedHttpServer", () => {
  let handle: ReturnType<typeof startHostedHttpServer> | undefined;

  afterEach(async () => {
    if (handle) {
      await handle.close();
      handle = undefined;
    }
  });

  it("serves GET /health", async () => {
    handle = startHostedHttpServer({ hosted: HOSTED, port: 0 });
    const port = await handle.ready;

    const response = await fetch(`http://127.0.0.1:${port}/health`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });

  it("returns 401 when Authorization header is missing", async () => {
    handle = startHostedHttpServer({ hosted: HOSTED, port: 0 });
    const port = await handle.ready;

    const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "initialize", id: 1, params: {} }),
    });

    expect(response.status).toBe(401);
  });
});
