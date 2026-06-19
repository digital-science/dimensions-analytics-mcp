/**
 * Tests for API key user resolution via Radar auth.json.
 * @module test/client/resolve-api-key-user
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthenticationError } from "../../src/client/errors.js";
import {
  JWT_API_KEY_SUB_PREFIX,
  parseBearerToken,
  resolveUserFromApiKey,
} from "../../src/client/resolve-api-key-user.js";
import { mockFetchJson } from "./helpers/mock-fetch.js";

function jwtWithSub(sub: string): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ sub })).toString("base64url");
  return `${header}.${payload}.signature`;
}

describe("parseBearerToken", () => {
  it("extracts token from Bearer header", () => {
    expect(parseBearerToken("Bearer abc123")).toBe("abc123");
  });

  it("throws when header is missing", () => {
    expect(() => parseBearerToken(undefined)).toThrow(AuthenticationError);
  });

  it("throws when header is not Bearer", () => {
    expect(() => parseBearerToken("Basic abc")).toThrow(AuthenticationError);
  });
});

describe("resolveUserFromApiKey", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("returns user email from JWT sub claim", async () => {
    const token = jwtWithSub("user@example.com");
    const mock = mockFetchJson({ token });

    const email = await resolveUserFromApiKey({
      apiKey: "user-key",
      authUrl: "https://app.example.com",
      clientIp: "203.0.113.10",
    });

    expect(email).toBe("user@example.com");
    expect(mock).toHaveBeenCalledWith(
      "https://app.example.com/api/auth.json",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "X-Forwarded-For": "203.0.113.10",
        }),
        body: JSON.stringify({ key: "user-key" }),
      }),
    );
  });

  it("rejects internal service API keys", async () => {
    mockFetchJson({ token: jwtWithSub(`${JWT_API_KEY_SUB_PREFIX}internal`) });

    await expect(
      resolveUserFromApiKey({
        apiKey: "internal-key",
        authUrl: "https://app.example.com",
      }),
    ).rejects.toThrow("Internal API keys cannot be used with hosted MCP");
  });

  it("throws on auth failure", async () => {
    mockFetchJson({}, { ok: false, status: 401 });

    await expect(
      resolveUserFromApiKey({
        apiKey: "bad-key",
        authUrl: "https://app.example.com",
      }),
    ).rejects.toThrow(AuthenticationError);
  });
});
