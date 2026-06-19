/**
 * Tests for internal dsl-service client.
 * @module test/client/internal-dsl-client
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { QuerySyntaxError } from "../../src/client/errors.js";
import { InternalDslClient } from "../../src/client/internal-dsl-client.js";
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
    vi.restoreAllMocks();
  });

  it("posts JSON query with service auth and user header", async () => {
    const responseBody = { publications: [] };
    const mock = mockFetchJson(responseBody);

    const client = new InternalDslClient({
      config: CONFIG,
      userEmail: "user@example.com",
      clientIp: "198.51.100.4",
    });

    const result = await client.query("search publications return publications limit 1");

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
        }),
        body: JSON.stringify({
          query: "search publications return publications limit 1",
          dsl_schema: "external",
          host: "app.example.com",
          variant: "standard",
          additional_logging_info: {
            user: "user@example.com",
            dimensions_user: "user@example.com",
            channel: "mcp",
            mcp_user: "mcp+user@example.com",
            product_variant: "standard",
            source: "dimensions-analytics-mcp-hosted",
          },
        }),
      }),
    );
  });

  it("maps 400 responses to QuerySyntaxError", async () => {
    mockFetchJson({ error: "syntax error" }, { ok: false, status: 400 });

    const client = new InternalDslClient({
      config: CONFIG,
      userEmail: "user@example.com",
    });

    await expect(client.query("bad query")).rejects.toBeInstanceOf(QuerySyntaxError);
  });
});
