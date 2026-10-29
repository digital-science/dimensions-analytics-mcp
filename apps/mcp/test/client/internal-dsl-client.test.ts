/**
 * Tests for internal dsl-service client.
 * @module test/client/internal-dsl-client
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { QuerySyntaxError, RateLimitError } from "../../src/client/errors.js";
import { InternalDslClient } from "../../src/client/internal-dsl-client.js";
import * as requestRetry from "../../src/client/request-retry.js";
import { runWithMcpTool, setMcpUsageSession } from "../../src/client/usage-context.js";
import {
  USAGE_HEADER_CHANNEL,
  USAGE_HEADER_MCP_CLIENT,
  USAGE_HEADER_MCP_DEPLOYMENT,
  USAGE_HEADER_MCP_SESSION_ID,
  USAGE_HEADER_MCP_TOOL,
  USAGE_HEADER_MCP_VERSION,
} from "../../src/client/usage-headers.js";
import { mockFetchJson } from "./helpers/mock-fetch.js";

const CONFIG = {
  serviceUrl: "https://dsl.example.com",
  username: "svc",
  password: "secret",
  dslSchema: "external",
  host: "app.example.com",
  variant: "standard",
};

describe("InternalDslClient", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    requestRetry.resetRequestRetryDelayFn();
    vi.restoreAllMocks();
  });

  it("posts JSON query with service auth, user header, and MCP usage headers", async () => {
    setMcpUsageSession({
      sessionId: "550e8400-e29b-41d4-a716-446655440000",
      deployment: "hosted",
      client: "cursor",
      version: "1.0.4",
    });

    const responseBody = { publications: [] };
    const mock = mockFetchJson(responseBody);

    const client = new InternalDslClient({
      config: CONFIG,
      userEmail: "user@example.com",
      clientIp: "198.51.100.4",
    });

    const result = await runWithMcpTool("search_publications", () =>
      client.query("search publications return publications limit 1"),
    );

    expect(result).toEqual(responseBody);
    expect(mock).toHaveBeenCalledWith(
      "https://dsl.example.com/query",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "X-DIMENSIONS-USER": "user@example.com",
          "X-Forwarded-For": "198.51.100.4",
          Authorization: `Basic ${Buffer.from("svc:secret").toString("base64")}`,
          [USAGE_HEADER_CHANNEL]: "mcp",
          [USAGE_HEADER_MCP_TOOL]: "search_publications",
          [USAGE_HEADER_MCP_SESSION_ID]: "550e8400-e29b-41d4-a716-446655440000",
          [USAGE_HEADER_MCP_CLIENT]: "cursor",
          [USAGE_HEADER_MCP_VERSION]: "1.0.4",
          [USAGE_HEADER_MCP_DEPLOYMENT]: "hosted",
          "User-Agent": "dimensions-analytics-mcp/1.0.4 (cursor)",
        }),
        body: JSON.stringify({
          query: "search publications return publications limit 1",
          dsl_schema: "external",
          host: "app.example.com",
          variant: "standard",
        }),
      }),
    );
  });

  it("omits the Authorization header when no service credentials are configured", async () => {
    const mock = mockFetchJson({ publications: [] });
    const { username: _u, password: _p, ...noAuthConfig } = CONFIG;

    const client = new InternalDslClient({
      config: noAuthConfig,
      userEmail: "user@example.com",
    });
    await client.query("search publications return publications limit 1");

    const headers = (mock.mock.calls[0][1] as { headers: Record<string, string> }).headers;
    expect(headers).not.toHaveProperty("Authorization");
    expect(headers["X-DIMENSIONS-USER"]).toBe("user@example.com");
  });

  it("maps 400 responses to QuerySyntaxError", async () => {
    mockFetchJson({ error: "syntax error" }, { ok: false, status: 400 });

    const client = new InternalDslClient({
      config: CONFIG,
      userEmail: "user@example.com",
    });

    await expect(client.query("bad query")).rejects.toBeInstanceOf(QuerySyntaxError);
  });

  it("retries on 429 and 5xx like the public HttpClient", async () => {
    requestRetry.setRequestRetryDelayFn(async () => {});

    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: "Too Many Requests",
        json: () => Promise.resolve({ error: "rate limited" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ publications: [] }),
      });
    globalThis.fetch = mockFetch;

    const client = new InternalDslClient({
      config: CONFIG,
      userEmail: "user@example.com",
      clientIp: "198.51.100.4",
      maxRetries: 2,
      retryDelay: 10,
    });

    const result = await client.query("search publications return publications limit 1");
    expect(result).toEqual({ publications: [] });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("returns a clear retry-after error when the DSL proxy keeps rate limiting", async () => {
    requestRetry.setRequestRetryDelayFn(async () => {});

    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      statusText: "Too Many Requests",
      headers: new Headers({ "Retry-After": "30" }),
      json: () => Promise.reject(new Error("nginx HTML body")),
    });
    globalThis.fetch = mockFetch;

    const client = new InternalDslClient({
      config: CONFIG,
      userEmail: "user@example.com",
      maxRetries: 3,
      retryDelay: 10,
    });

    const error = await client
      .query("search publications return publications limit 1")
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(RateLimitError);
    expect((error as RateLimitError).message).toBe("Rate limit exceeded — retry after 30 seconds");
    expect((error as RateLimitError).retryAfter).toBe(30);
    // 30s exceeds the in-request wait cap: fail fast instead of hanging the tool call.
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("does not set X-Forwarded-For when clientIp is omitted", async () => {
    mockFetchJson({ publications: [] });

    const client = new InternalDslClient({
      config: CONFIG,
      userEmail: "user@example.com",
    });

    await client.query("search publications return publications limit 1");

    const [, fetchOptions] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(fetchOptions.headers["X-Forwarded-For"]).toBeUndefined();
  });
});
