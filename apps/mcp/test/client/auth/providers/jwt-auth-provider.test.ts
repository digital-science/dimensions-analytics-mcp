import { afterEach, describe, expect, it, vi } from "vitest";
import { JwtAuthProvider } from "../../../../src/client/auth/providers/jwt-auth-provider.js";
import { AuthenticationError, NetworkError } from "../../../../src/client/errors.js";
import { mockFetchError, mockFetchJson } from "../../../client/helpers/mock-fetch.js";

const VALID_JWT = "eyJhbGc.eyJzdWI.dGVzdA";
const VALID_JWT_2 = "eyJhbGc.eyJyZWY.cmVmcg";

describe("JwtAuthProvider", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe("constructor", () => {
    it("creates provider with correct type", () => {
      const provider = new JwtAuthProvider({
        type: "jwt",
        apiKey: "test-api-key",
      });

      expect(provider.type).toBe("jwt");
    });
  });

  describe("getHeaders", () => {
    it("fetches token on first call and returns Authorization header", async () => {
      const mock = mockFetchJson({ token: VALID_JWT });

      const provider = new JwtAuthProvider({
        type: "jwt",
        apiKey: "test-api-key",
      });

      const headers = await provider.getHeaders();

      expect(headers).toEqual({
        Authorization: `JWT ${VALID_JWT}`,
      });
      expect(mock).toHaveBeenCalledTimes(1);
    });

    it("uses custom auth URL when provided", async () => {
      const mock = mockFetchJson({ token: VALID_JWT });

      const provider = new JwtAuthProvider({
        type: "jwt",
        apiKey: "test-api-key",
        authUrl: "https://custom.auth.example.com/token",
      });

      await provider.getHeaders();

      expect(mock).toHaveBeenCalledWith(
        "https://custom.auth.example.com/token",
        expect.any(Object),
      );
    });

    it("supports access_token response format", async () => {
      mockFetchJson({ access_token: VALID_JWT });

      const provider = new JwtAuthProvider({
        type: "jwt",
        apiKey: "test-api-key",
      });

      const headers = await provider.getHeaders();

      expect(headers.Authorization).toBe(`JWT ${VALID_JWT}`);
    });

    it("sends API key in request body", async () => {
      const mock = mockFetchJson({ token: VALID_JWT });

      const provider = new JwtAuthProvider({
        type: "jwt",
        apiKey: "my-secret-api-key",
      });

      await provider.getHeaders();

      const [, options] = mock.mock.calls[0];
      expect(options.method).toBe("POST");
      expect(options.headers["Content-Type"]).toBe("application/json");
      expect(JSON.parse(options.body)).toEqual({ key: "my-secret-api-key" });
    });
  });

  describe("initialize", () => {
    it("fetches token on initialize", async () => {
      const mock = mockFetchJson({ token: VALID_JWT });

      const provider = new JwtAuthProvider({
        type: "jwt",
        apiKey: "test-api-key",
      });

      await provider.initialize();

      expect(mock).toHaveBeenCalledTimes(1);
    });

    it("only initializes once", async () => {
      const mock = mockFetchJson({ token: VALID_JWT });

      const provider = new JwtAuthProvider({
        type: "jwt",
        apiKey: "test-api-key",
      });

      await provider.initialize();
      await provider.initialize();
      await provider.initialize();

      expect(mock).toHaveBeenCalledTimes(1);
    });
  });

  describe("refresh", () => {
    it("fetches a new token", async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ token: VALID_JWT }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ token: VALID_JWT_2 }),
        });
      globalThis.fetch = mockFetch;

      const provider = new JwtAuthProvider({
        type: "jwt",
        apiKey: "test-api-key",
      });

      const headers1 = await provider.getHeaders();
      expect(headers1.Authorization).toBe(`JWT ${VALID_JWT}`);

      await provider.refresh();
      const headers2 = await provider.getHeaders();

      expect(headers2.Authorization).toBe(`JWT ${VALID_JWT_2}`);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe("invalidate", () => {
    it("clears current token and forces re-fetch", async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ token: VALID_JWT }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ token: VALID_JWT_2 }),
        });
      globalThis.fetch = mockFetch;

      const provider = new JwtAuthProvider({
        type: "jwt",
        apiKey: "test-api-key",
      });

      await provider.getHeaders();
      expect(mockFetch).toHaveBeenCalledTimes(1);

      provider.invalidate();

      const headers = await provider.getHeaders();
      expect(headers.Authorization).toBe(`JWT ${VALID_JWT_2}`);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe("error handling", () => {
    it("throws AuthenticationError on HTTP error response", async () => {
      mockFetchError({ status: 401, statusText: "Unauthorized" });

      const provider = new JwtAuthProvider({
        type: "jwt",
        apiKey: "invalid-key",
      });

      const error = await provider.getHeaders().catch((e: unknown) => e);
      expect(error).toBeInstanceOf(AuthenticationError);
      expect(error).toHaveProperty("message", "Authentication failed: 401 Unauthorized");
    });

    it("throws AuthenticationError when no token in response", async () => {
      mockFetchJson({});

      const provider = new JwtAuthProvider({
        type: "jwt",
        apiKey: "test-api-key",
      });

      const error = await provider.getHeaders().catch((e: unknown) => e);
      expect(error).toBeInstanceOf(AuthenticationError);
      expect((error as Error).message).toContain("Invalid authentication response");
    });

    it("throws AuthenticationError when token is empty string", async () => {
      mockFetchJson({ token: "" });

      const provider = new JwtAuthProvider({
        type: "jwt",
        apiKey: "test-api-key",
      });

      const error = await provider.getHeaders().catch((e: unknown) => e);
      expect(error).toBeInstanceOf(AuthenticationError);
      expect((error as Error).message).toContain("Invalid authentication response");
    });

    it("throws AuthenticationError when access_token is empty string", async () => {
      mockFetchJson({ access_token: "" });

      const provider = new JwtAuthProvider({
        type: "jwt",
        apiKey: "test-api-key",
      });

      const error = await provider.getHeaders().catch((e: unknown) => e);
      expect(error).toBeInstanceOf(AuthenticationError);
      expect((error as Error).message).toContain("Invalid authentication response");
    });

    it("throws AuthenticationError when both token fields are empty", async () => {
      mockFetchJson({ token: "", access_token: "" });

      const provider = new JwtAuthProvider({
        type: "jwt",
        apiKey: "test-api-key",
      });

      const error = await provider.getHeaders().catch((e: unknown) => e);
      expect(error).toBeInstanceOf(AuthenticationError);
      expect((error as Error).message).toContain("Invalid authentication response");
    });

    it("prefers token over access_token when both are present", async () => {
      mockFetchJson({ token: VALID_JWT, access_token: VALID_JWT_2 });

      const provider = new JwtAuthProvider({
        type: "jwt",
        apiKey: "test-api-key",
      });

      const headers = await provider.getHeaders();
      expect(headers.Authorization).toBe(`JWT ${VALID_JWT}`);
    });

    it("throws AuthenticationError on malformed response", async () => {
      mockFetchJson("not an object");

      const provider = new JwtAuthProvider({
        type: "jwt",
        apiKey: "test-api-key",
      });

      const error = await provider.getHeaders().catch((e: unknown) => e);
      expect(error).toBeInstanceOf(AuthenticationError);
      expect((error as Error).message).toContain("Invalid authentication response");
    });

    it("throws NetworkError on fetch failure", async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error("Connection refused"));
      globalThis.fetch = mockFetch;

      const provider = new JwtAuthProvider({
        type: "jwt",
        apiKey: "test-api-key",
      });

      await expect(provider.getHeaders()).rejects.toThrow(NetworkError);
    });

    it("throws AuthenticationError for token with invalid JWT structure", async () => {
      mockFetchJson({ token: "not-a-jwt" });

      const provider = new JwtAuthProvider({
        type: "jwt",
        apiKey: "test-api-key",
      });

      const error = await provider.getHeaders().catch((e: unknown) => e);
      expect(error).toBeInstanceOf(AuthenticationError);
      expect((error as Error).message).toContain("Invalid JWT");
    });

    it("uses sanitized error message in NetworkError catch", async () => {
      const mockFetch = vi
        .fn()
        .mockRejectedValue(new Error("connect to https://user:secret123@api.example.com failed"));
      globalThis.fetch = mockFetch;

      const provider = new JwtAuthProvider({
        type: "jwt",
        apiKey: "test-api-key",
      });

      const error = await provider.getHeaders().catch((e: unknown) => e);
      expect(error).toBeInstanceOf(NetworkError);
      const msg = (error as Error).message;
      expect(msg).not.toContain("secret123");
      expect(msg).toContain("[redacted]");
    });

    it("throws NetworkError on timeout", async () => {
      const mockFetch = vi.fn().mockImplementation(() => {
        const error = new Error("Aborted");
        error.name = "AbortError";
        return Promise.reject(error);
      });
      globalThis.fetch = mockFetch;

      const provider = new JwtAuthProvider({
        type: "jwt",
        apiKey: "test-api-key",
        timeout: 100,
      });

      const thrown = await provider.getHeaders().catch((e: unknown) => e);
      expect(thrown).toBeInstanceOf(NetworkError);
      expect(thrown).toHaveProperty("message", "Authentication request timeout");
    });
  });

  describe("JWT structural validation", () => {
    it("rejects token with 1 segment", async () => {
      mockFetchJson({ token: "x" });

      const provider = new JwtAuthProvider({ type: "jwt", apiKey: "key" });
      const error = await provider.getHeaders().catch((e: unknown) => e);
      expect(error).toBeInstanceOf(AuthenticationError);
      expect((error as Error).message).toContain("Invalid JWT structure");
    });

    it("rejects token with 2 segments", async () => {
      mockFetchJson({ token: "abc.def" });

      const provider = new JwtAuthProvider({ type: "jwt", apiKey: "key" });
      const error = await provider.getHeaders().catch((e: unknown) => e);
      expect(error).toBeInstanceOf(AuthenticationError);
      expect((error as Error).message).toContain("Invalid JWT structure");
    });

    it("rejects token with 4 segments", async () => {
      mockFetchJson({ token: "a.b.c.d" });

      const provider = new JwtAuthProvider({ type: "jwt", apiKey: "key" });
      const error = await provider.getHeaders().catch((e: unknown) => e);
      expect(error).toBeInstanceOf(AuthenticationError);
      expect((error as Error).message).toContain("Invalid JWT structure");
    });

    it("rejects token with invalid base64url chars", async () => {
      mockFetchJson({ token: "abc!.def.ghi" });

      const provider = new JwtAuthProvider({ type: "jwt", apiKey: "key" });
      const error = await provider.getHeaders().catch((e: unknown) => e);
      expect(error).toBeInstanceOf(AuthenticationError);
      expect((error as Error).message).toContain("Invalid JWT structure");
    });

    it("rejects token with empty segment", async () => {
      mockFetchJson({ token: "abc..def" });

      const provider = new JwtAuthProvider({ type: "jwt", apiKey: "key" });
      const error = await provider.getHeaders().catch((e: unknown) => e);
      expect(error).toBeInstanceOf(AuthenticationError);
    });

    it("accepts valid 3-segment base64url token", async () => {
      mockFetchJson({ token: VALID_JWT });

      const provider = new JwtAuthProvider({ type: "jwt", apiKey: "key" });
      const headers = await provider.getHeaders();
      expect(headers.Authorization).toBe(`JWT ${VALID_JWT}`);
    });

    it("rejects long malformed token", async () => {
      mockFetchJson({ token: "abcdefghijklmnopqrstuvwxyz" });

      const provider = new JwtAuthProvider({ type: "jwt", apiKey: "key" });
      const error = await provider.getHeaders().catch((e: unknown) => e);
      expect(error).toBeInstanceOf(AuthenticationError);
      expect((error as Error).message).toContain("Invalid JWT structure");
    });
  });
});
