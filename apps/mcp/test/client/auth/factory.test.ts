import { afterEach, describe, expect, it, vi } from "vitest";
import { createAuthProvider } from "../../../src/client/auth/factory.js";
import { ValidationError } from "../../../src/client/errors.js";

describe("createAuthProvider", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("creates JWT provider with caching", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ token: "eyJhbGc.eyJzdWI.dGVzdA" }),
    });
    globalThis.fetch = mockFetch;

    const provider = createAuthProvider({
      type: "jwt",
      apiKey: "test-api-key",
    });

    expect(provider.type).toBe("jwt");

    const headers = await provider.getHeaders();
    expect(headers.Authorization).toBe("JWT eyJhbGc.eyJzdWI.dGVzdA");

    await provider.getHeaders();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("passes auth URL to provider", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ token: "eyJhbGc.eyJzdWI.dGVzdA" }),
    });
    globalThis.fetch = mockFetch;

    const provider = createAuthProvider({
      type: "jwt",
      apiKey: "test-api-key",
      authUrl: "https://custom.auth.com/token",
    });

    await provider.getHeaders();
    expect(mockFetch).toHaveBeenCalledWith("https://custom.auth.com/token", expect.any(Object));
  });

  it("throws ValidationError for missing API key", () => {
    expect(() =>
      createAuthProvider({
        type: "jwt",
        apiKey: "",
      }),
    ).toThrow(ValidationError);
  });

  it("throws ValidationError for invalid auth URL", () => {
    expect(() =>
      createAuthProvider({
        type: "jwt",
        apiKey: "valid-key",
        authUrl: "not-a-valid-url",
      }),
    ).toThrow(ValidationError);
  });
});
