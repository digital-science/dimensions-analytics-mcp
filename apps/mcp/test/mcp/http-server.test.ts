/**
 * Smoke tests for hosted HTTP MCP server.
 * @module test/mcp/http-server
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import type { HostedEnvConfig } from "../../src/client/deployment-config.js";
import { AuthenticationError } from "../../src/client/errors.js";
import { startHostedHttpServer } from "../../src/mcp/http-server.js";
import { warmHostedSchemaCache } from "../../src/mcp/server.js";

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
    await handle.schemaReady;

    const response = await fetch(`http://127.0.0.1:${port}/health`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });

  it("returns 401 when Authorization header is missing", async () => {
    handle = startHostedHttpServer({ hosted: HOSTED, port: 0 });
    const port = await handle.ready;
    await handle.schemaReady;

    const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "initialize", id: 1, params: {} }),
    });

    expect(response.status).toBe(401);
  });

  describe("startup before dsl-service is reachable", () => {
    const FAST_RETRY = { initialDelayMs: 5, maxDelayMs: 20 };

    it("keeps listening and retries the schema load instead of exiting", async () => {
      const warm = vi.mocked(warmHostedSchemaCache);
      warm.mockClear();
      warm
        .mockRejectedValueOnce(new Error("Network error: fetch failed"))
        .mockRejectedValueOnce(new Error("Network error: fetch failed"));
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      handle = startHostedHttpServer({ hosted: HOSTED, port: 0, schemaWarmupRetry: FAST_RETRY });
      const port = await handle.ready;
      await handle.schemaReady;

      expect(warm).toHaveBeenCalledTimes(3);
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      expect(response.status).toBe(200);
      errorSpy.mockRestore();
    });

    it("reports not ready on /health and /mcp until the schema loads", async () => {
      let finishWarmup: (() => void) | undefined;
      vi.mocked(warmHostedSchemaCache).mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishWarmup = () => resolve({} as never);
          }),
      );

      handle = startHostedHttpServer({ hosted: HOSTED, port: 0, schemaWarmupRetry: FAST_RETRY });
      const port = await handle.ready;

      const health = await fetch(`http://127.0.0.1:${port}/health`);
      expect(health.status).toBe(503);
      expect(await health.json()).toMatchObject({ status: "starting" });

      const mcp = await fetch(`http://127.0.0.1:${port}/mcp`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer key" },
        body: JSON.stringify({ jsonrpc: "2.0", method: "initialize", id: 1, params: {} }),
      });
      expect(mcp.status).toBe(503);
      expect(mcp.headers.get("retry-after")).toBe("5");
      const body = (await mcp.json()) as { error: { message: string } };
      expect(body.error.message).toContain("schema not loaded yet");

      finishWarmup?.();
      await handle.schemaReady;
      expect((await fetch(`http://127.0.0.1:${port}/health`)).status).toBe(200);
    });

    it("includes the last load error in /health while retrying", async () => {
      vi.mocked(warmHostedSchemaCache).mockRejectedValue(new Error("Network error: fetch failed"));
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      handle = startHostedHttpServer({
        hosted: HOSTED,
        port: 0,
        schemaWarmupRetry: { initialDelayMs: 60_000, maxDelayMs: 60_000 },
      });
      const port = await handle.ready;
      await vi.waitFor(() => expect(errorSpy).toHaveBeenCalled());

      const health = await fetch(`http://127.0.0.1:${port}/health`);
      expect(health.status).toBe(503);
      expect(await health.json()).toEqual({
        status: "starting",
        reason: "Schema not loaded yet: Network error: fetch failed",
      });

      // close() must stop the retry loop without waiting for the 60s backoff.
      const { schemaReady } = handle;
      await handle.close();
      handle = undefined;
      await schemaReady;
      vi.mocked(warmHostedSchemaCache)
        .mockReset()
        .mockResolvedValue({} as never);
      errorSpy.mockRestore();
    });
  });
});
