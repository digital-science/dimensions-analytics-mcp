import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthProvider } from "../../src/client/auth/types.js";
import {
  DimensionsError,
  NetworkError,
  QuerySyntaxError,
  RateLimitError,
  ServerError,
  TimeoutError,
} from "../../src/client/errors.js";
import { HttpClient } from "../../src/client/http-client.js";
import { RateLimiter } from "../../src/client/rate-limiter.js";

/**
 * Creates a mock auth provider for testing.
 */
function createMockAuthProvider(token: string = "eyJhbGc.eyJzdWI.dGVzdA"): AuthProvider {
  return {
    type: "jwt",
    initialize: vi.fn().mockResolvedValue(undefined),
    getHeaders: vi.fn().mockResolvedValue({ Authorization: `JWT ${token}` }),
    refresh: vi.fn().mockResolvedValue(undefined),
    invalidate: vi.fn(),
  };
}

describe("HttpClient", () => {
  let client: HttpClient;
  let mockAuthProvider: AuthProvider;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    mockAuthProvider = createMockAuthProvider();
    client = new HttpClient({
      baseUrl: "https://app.dimensions.ai",
      authProvider: mockAuthProvider,
      timeout: 5000,
      maxRetries: 3,
      retryDelay: 10, // Short delay for faster tests
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe("successful requests", () => {
    it("sends DSL query with correct headers", async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            _stats: { total_count: 1 },
            publications: [{ id: "pub.123", title: "Test Publication" }],
          }),
      });
      globalThis.fetch = mockFetch;

      await client.query('search publications for "test"');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe("https://app.dimensions.ai/api/dsl/v2");
      expect(options.method).toBe("POST");
      expect(options.headers["Authorization"]).toBe("JWT eyJhbGc.eyJzdWI.dGVzdA");
      expect(options.headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
      expect(options.body).toBe('search publications for "test"');
    });

    it("returns parsed response", async () => {
      const mockResponse = {
        _stats: { total_count: 2 },
        publications: [
          { id: "pub.1", title: "First" },
          { id: "pub.2", title: "Second" },
        ],
      };

      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });
      globalThis.fetch = mockFetch;

      const result = await client.query('search publications for "test"');

      expect(result).toEqual(mockResponse);
    });

    it("calls authProvider.getHeaders on each request", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ _stats: { total_count: 0 } }),
      });
      globalThis.fetch = mockFetch;

      await client.query("search publications");
      await client.query("search publications");

      expect(mockAuthProvider.getHeaders).toHaveBeenCalledTimes(2);
    });

    it("query() without options still works", async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ _stats: { total_count: 0 } }),
      });
      globalThis.fetch = mockFetch;

      const result = await client.query("search publications");

      expect(result).toEqual({ _stats: { total_count: 0 } });
    });

    it("query() with timeout option overrides default timeout", async () => {
      const mockFetch = vi.fn().mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  ok: true,
                  json: () => Promise.resolve({ _stats: { total_count: 0 } }),
                }),
              10,
            ),
          ),
      );
      globalThis.fetch = mockFetch;

      await client.query("search publications", "/api/dsl/v2", { timeout: 60000 });

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("query() with signal threads AbortSignal to fetch", async () => {
      const controller = new AbortController();
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ _stats: { total_count: 0 } }),
      });
      globalThis.fetch = mockFetch;

      await client.query("search publications", "/api/dsl/v2", {
        signal: controller.signal,
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [, fetchOptions] = mockFetch.mock.calls[0];
      // When an external signal is provided, AbortSignal.any is used to compose it
      // with the internal timeout signal — so signal should be defined
      expect(fetchOptions.signal).toBeDefined();
    });
  });

  describe("retry behavior", () => {
    it("retries on 429 rate limit error", async () => {
      vi.spyOn(client as never, "delay" as never).mockResolvedValue(undefined as never);

      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          statusText: "Too Many Requests",
          headers: new Headers({ "Retry-After": "1" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ _stats: { total_count: 0 } }),
        });
      globalThis.fetch = mockFetch;

      const result = await client.query("search publications");

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ _stats: { total_count: 0 } });
    });

    it("retries on 500 server error", async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: "Internal Server Error",
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ _stats: { total_count: 0 } }),
        });
      globalThis.fetch = mockFetch;

      const result = await client.query("search publications");

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ _stats: { total_count: 0 } });
    });

    it("retries on 502 bad gateway", async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 502,
          statusText: "Bad Gateway",
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ _stats: { total_count: 0 } }),
        });
      globalThis.fetch = mockFetch;

      const result = await client.query("search publications");

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ _stats: { total_count: 0 } });
    });

    it("retries on 503 service unavailable", async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 503,
          statusText: "Service Unavailable",
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ _stats: { total_count: 0 } }),
        });
      globalThis.fetch = mockFetch;

      const result = await client.query("search publications");

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ _stats: { total_count: 0 } });
    });

    it("exhausts retries and throws RateLimitError", async () => {
      vi.spyOn(client as never, "delay" as never).mockResolvedValue(undefined as never);

      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        statusText: "Too Many Requests",
        headers: new Headers({ "Retry-After": "60" }),
      });
      globalThis.fetch = mockFetch;

      await expect(client.query("search publications")).rejects.toThrow(RateLimitError);

      // Initial + 3 retries = 4 calls
      expect(mockFetch).toHaveBeenCalledTimes(4);
    });

    it("exhausts retries and throws ServerError", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      });
      globalThis.fetch = mockFetch;

      await expect(client.query("search publications")).rejects.toThrow(ServerError);

      expect(mockFetch).toHaveBeenCalledTimes(4);
    });

    it("uses client rate limiter delay for 429 responses", async () => {
      const rateLimiter = new RateLimiter({ maxRequests: 30, windowMs: 60_000 });
      const limitedClient = new HttpClient({
        baseUrl: "https://app.dimensions.ai",
        authProvider: mockAuthProvider,
        timeout: 5000,
        maxRetries: 1,
        retryDelay: 10,
        rateLimiter,
      });

      const delaySpy = vi
        .spyOn(limitedClient as never, "delay" as never)
        .mockResolvedValue(undefined as never);

      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          statusText: "Too Many Requests",
          headers: new Headers(),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ _stats: { total_count: 0 } }),
        });
      globalThis.fetch = mockFetch;

      await limitedClient.query("search publications");

      expect(delaySpy).toHaveBeenCalledTimes(1);
      expect(delaySpy).toHaveBeenCalledWith(2050);
    });

    it("uses exponential backoff for 5xx errors", async () => {
      const delaySpy = vi
        .spyOn(client as never, "delay" as never)
        .mockResolvedValue(undefined as never);

      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: "Internal Server Error",
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: "Internal Server Error",
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ _stats: { total_count: 0 } }),
        });
      globalThis.fetch = mockFetch;

      await client.query("search publications");

      expect(delaySpy).toHaveBeenCalledTimes(2);
      const firstDelay = delaySpy.mock.calls[0][0] as number;
      const secondDelay = delaySpy.mock.calls[1][0] as number;
      // With retryDelay=10, attempt 0: 10 * 2^0 * (0.5..1) = 5..10
      // attempt 1: 10 * 2^1 * (0.5..1) = 10..20
      expect(firstDelay).toBeGreaterThanOrEqual(5);
      expect(firstDelay).toBeLessThanOrEqual(10);
      expect(secondDelay).toBeGreaterThanOrEqual(10);
      expect(secondDelay).toBeLessThanOrEqual(20);
      // Second delay should be larger on average (exponential)
    });

    it("caps retry delay at 60 seconds", async () => {
      const largeDelayClient = new HttpClient({
        baseUrl: "https://app.dimensions.ai",
        authProvider: mockAuthProvider,
        timeout: 5000,
        maxRetries: 1,
        retryDelay: 100000, // Very large base delay
      });

      const delaySpy = vi
        .spyOn(largeDelayClient as never, "delay" as never)
        .mockResolvedValue(undefined as never);

      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: "Internal Server Error",
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ _stats: { total_count: 0 } }),
        });
      globalThis.fetch = mockFetch;

      await largeDelayClient.query("search publications");

      expect(delaySpy).toHaveBeenCalledTimes(1);
      expect(delaySpy.mock.calls[0][0] as number).toBeLessThanOrEqual(60000);
    });

    it("caps rate-limit retry delay at 60 seconds", async () => {
      const rateLimiter = new RateLimiter({ maxRequests: 1, windowMs: 120_000 });
      rateLimiter.recordRequest();
      vi.spyOn(rateLimiter, "waitIfNeeded").mockResolvedValue(undefined);
      const limitedClient = new HttpClient({
        baseUrl: "https://app.dimensions.ai",
        authProvider: mockAuthProvider,
        timeout: 5000,
        maxRetries: 1,
        retryDelay: 10,
        rateLimiter,
      });

      const delaySpy = vi
        .spyOn(limitedClient as never, "delay" as never)
        .mockResolvedValue(undefined as never);

      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          statusText: "Too Many Requests",
          headers: new Headers(),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ _stats: { total_count: 0 } }),
        });
      globalThis.fetch = mockFetch;

      await limitedClient.query("search publications");

      expect(delaySpy).toHaveBeenCalledTimes(1);
      expect(delaySpy).toHaveBeenCalledWith(60_000);
    });
  });

  describe("non-retryable errors", () => {
    it("does NOT retry on 400 syntax error", async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: "Bad Request",
        json: () =>
          Promise.resolve({
            error: { message: "Query syntax error near 'for'" },
          }),
      });
      globalThis.fetch = mockFetch;

      await expect(client.query("search publications for")).rejects.toThrow(QuerySyntaxError);

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("does NOT retry on 401 auth error", async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
      });
      globalThis.fetch = mockFetch;

      await expect(client.query("search publications")).rejects.toThrow("Authentication failed");

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("does NOT retry on 403 forbidden", async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: "Forbidden",
      });
      globalThis.fetch = mockFetch;

      await expect(client.query("search publications")).rejects.toThrow("Access denied");

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe("timeout handling", () => {
    it("throws TimeoutError when request times out", async () => {
      const slowClient = new HttpClient({
        baseUrl: "https://app.dimensions.ai",
        authProvider: mockAuthProvider,
        timeout: 50,
        maxRetries: 0,
        retryDelay: 100,
      });

      const mockFetch = vi.fn().mockImplementationOnce(() => {
        const error = new Error("Aborted");
        error.name = "AbortError";
        return Promise.reject(error);
      });
      globalThis.fetch = mockFetch;

      await expect(slowClient.query("search publications")).rejects.toThrow(TimeoutError);
    });
  });

  describe("signal combination", () => {
    it("passes combined signal to fetch when caller signal is provided", async () => {
      const controller = new AbortController();

      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: "result" }),
      });
      globalThis.fetch = mockFetch;

      const noRetryClient = new HttpClient({
        baseUrl: "https://app.dimensions.ai",
        authProvider: mockAuthProvider,
        maxRetries: 0,
      });

      await noRetryClient.get("/api/test", { signal: controller.signal });

      const [, fetchOptions] = mockFetch.mock.calls[0];
      // AbortSignal.any() returns a new composite signal, not the caller's raw signal
      expect(fetchOptions.signal).not.toBe(controller.signal);
    });

    it("maps caller signal abort to TimeoutError", async () => {
      const controller = new AbortController();
      controller.abort();

      const mockFetch = vi.fn().mockImplementation(() => {
        const error = new Error("Aborted");
        error.name = "AbortError";
        return Promise.reject(error);
      });
      globalThis.fetch = mockFetch;

      const noRetryClient = new HttpClient({
        baseUrl: "https://app.dimensions.ai",
        authProvider: mockAuthProvider,
        maxRetries: 0,
      });

      await expect(noRetryClient.get("/api/test", { signal: controller.signal })).rejects.toThrow(
        TimeoutError,
      );
    });

    it("maps internal timeout to TimeoutError when no caller signal provided", async () => {
      const mockFetch = vi.fn().mockImplementation(() => {
        const error = new Error("Aborted");
        error.name = "AbortError";
        return Promise.reject(error);
      });
      globalThis.fetch = mockFetch;

      const noRetryClient = new HttpClient({
        baseUrl: "https://app.dimensions.ai",
        authProvider: mockAuthProvider,
        timeout: 50,
        maxRetries: 0,
      });

      await expect(noRetryClient.query("search publications")).rejects.toThrow(TimeoutError);
    });
  });

  describe("network error handling", () => {
    it("throws NetworkError on fetch failure", async () => {
      const noRetryClient = new HttpClient({
        baseUrl: "https://app.dimensions.ai",
        authProvider: mockAuthProvider,
        timeout: 5000,
        maxRetries: 0,
        retryDelay: 10,
      });

      const mockFetch = vi.fn().mockRejectedValueOnce(new Error("Network failure"));
      globalThis.fetch = mockFetch;

      await expect(noRetryClient.query("search publications")).rejects.toThrow(NetworkError);
    });

    it("retries network errors", async () => {
      const mockFetch = vi
        .fn()
        .mockRejectedValueOnce(new Error("Network failure"))
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ _stats: { total_count: 0 } }),
        });
      globalThis.fetch = mockFetch;

      const result = await client.query("search publications");

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ _stats: { total_count: 0 } });
    });
  });

  describe("rate limit error details", () => {
    it("includes client rate-limit info when a rate limiter is configured", async () => {
      const rateLimiter = new RateLimiter({ maxRequests: 30, windowMs: 60_000 });
      const noRetryClient = new HttpClient({
        baseUrl: "https://app.dimensions.ai",
        authProvider: mockAuthProvider,
        timeout: 5000,
        maxRetries: 0,
        rateLimiter,
      });

      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        statusText: "Too Many Requests",
        headers: new Headers(),
      });
      globalThis.fetch = mockFetch;

      const error = await noRetryClient.query("search publications").catch((e: unknown) => e);

      expect(error).toBeInstanceOf(RateLimitError);
      expect((error as RateLimitError).retryAfter).toBe(3);
      expect((error as RateLimitError).clientRateLimit).toEqual({
        remaining: 30,
        retryAfterMs: 2050,
      });
    });

    it("uses a conservative default delay without a rate limiter", async () => {
      const noRetryClient = new HttpClient({
        baseUrl: "https://app.dimensions.ai",
        authProvider: mockAuthProvider,
        maxRetries: 0,
      });

      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        statusText: "Too Many Requests",
        headers: new Headers(),
      });
      globalThis.fetch = mockFetch;

      const error = await noRetryClient.query("search publications").catch((e: unknown) => e);

      expect(error).toBeInstanceOf(RateLimitError);
      expect((error as RateLimitError).retryAfter).toBe(2);
      expect((error as RateLimitError).clientRateLimit).toEqual({
        remaining: 0,
        retryAfterMs: 2000,
      });
    });
  });

  describe("custom endpoint", () => {
    it("uses custom endpoint when provided", async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ result: "data" }),
      });
      globalThis.fetch = mockFetch;

      await client.query("search publications", "/api/custom");

      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe("https://app.dimensions.ai/api/custom");
    });
  });

  describe("error handling edge cases", () => {
    it("handles 400 error without JSON body", async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: "Bad Request",
        json: () => Promise.reject(new Error("Not JSON")),
      });
      globalThis.fetch = mockFetch;

      await expect(client.query("invalid query")).rejects.toThrow(QuerySyntaxError);
      // Should use default message when JSON parsing fails
    });

    it("throws NetworkError for unknown error types", async () => {
      const noRetryClient = new HttpClient({
        baseUrl: "https://app.dimensions.ai",
        authProvider: mockAuthProvider,
        maxRetries: 0,
      });

      const mockFetch = vi.fn().mockRejectedValue("string error");
      globalThis.fetch = mockFetch;

      await expect(noRetryClient.query("search publications")).rejects.toThrow(
        "Unknown network error",
      );
    });

    it("maps 403 to generic DimensionsError", async () => {
      const noRetryClient = new HttpClient({
        baseUrl: "https://app.dimensions.ai",
        authProvider: mockAuthProvider,
        maxRetries: 0,
      });

      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        statusText: "Forbidden",
      });
      globalThis.fetch = mockFetch;

      const error = await noRetryClient.query("search publications").catch((e: unknown) => e);

      expect(error).toBeInstanceOf(DimensionsError);
      expect((error as DimensionsError).statusCode).toBe(403);
      expect((error as DimensionsError).message).toBe("Access denied");
    });

    it("maps unknown 4xx status to generic DimensionsError", async () => {
      const noRetryClient = new HttpClient({
        baseUrl: "https://app.dimensions.ai",
        authProvider: mockAuthProvider,
        maxRetries: 0,
      });

      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 418,
        statusText: "I'm a teapot",
      });
      globalThis.fetch = mockFetch;

      const error = await noRetryClient.query("search publications").catch((e: unknown) => e);

      expect(error).toBeInstanceOf(DimensionsError);
      expect((error as DimensionsError).statusCode).toBe(418);
      expect((error as DimensionsError).message).toContain("I'm a teapot");
    });
  });

  describe("constructor validation", () => {
    it("uses default values when not provided", () => {
      const defaultClient = new HttpClient({
        baseUrl: "https://example.com",
        authProvider: mockAuthProvider,
      });

      expect(defaultClient).toBeInstanceOf(HttpClient);
    });

    it("accepts custom configuration", () => {
      const customClient = new HttpClient({
        baseUrl: "https://custom.api.com",
        authProvider: mockAuthProvider,
        timeout: 60000,
        maxRetries: 5,
        retryDelay: 500,
      });

      expect(customClient).toBeInstanceOf(HttpClient);
    });
  });

  describe("get method", () => {
    it("sends GET request with query parameters", async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: "result" }),
      });
      globalThis.fetch = mockFetch;

      const result = await client.get<{ data: string }>("/api/test", {
        params: { q: "search", limit: 10, active: true },
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe("https://app.dimensions.ai/api/test?q=search&limit=10&active=true");
      expect(options.method).toBe("GET");
      expect(result).toEqual({ data: "result" });
    });

    it("sends GET request without params", async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: "result" }),
      });
      globalThis.fetch = mockFetch;

      await client.get("/api/test");

      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe("https://app.dimensions.ai/api/test");
    });

    it("handles array params in GET request", async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: "result" }),
      });
      globalThis.fetch = mockFetch;

      await client.get("/api/test", {
        params: { ids: [1, 2, 3] },
      });

      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe("https://app.dimensions.ai/api/test?ids=1&ids=2&ids=3");
    });

    it("retries GET on server error", async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: "Internal Server Error",
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ data: "success" }),
        });
      globalThis.fetch = mockFetch;

      const result = await client.get("/api/test");

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ data: "success" });
    });

    it("supports custom headers in GET request", async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: "result" }),
      });
      globalThis.fetch = mockFetch;

      await client.get("/api/test", {
        headers: { "X-Custom": "value" },
      });

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers["X-Custom"]).toBe("value");
    });

    it("supports AbortSignal in GET request", async () => {
      const controller = new AbortController();
      controller.abort();

      const mockFetch = vi.fn().mockImplementation(() => {
        const error = new Error("Aborted");
        error.name = "AbortError";
        return Promise.reject(error);
      });
      globalThis.fetch = mockFetch;

      const noRetryClient = new HttpClient({
        baseUrl: "https://app.dimensions.ai",
        authProvider: mockAuthProvider,
        maxRetries: 0,
      });

      await expect(noRetryClient.get("/api/test", { signal: controller.signal })).rejects.toThrow(
        TimeoutError,
      );
    });
  });

  describe("postJson method", () => {
    it("sends POST request with JSON body", async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ result: "success" }),
      });
      globalThis.fetch = mockFetch;

      const result = await client.postJson<{ result: string }>("/api/test", {
        json: { query: "test", limit: 10 },
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe("https://app.dimensions.ai/api/test");
      expect(options.method).toBe("POST");
      expect(options.headers["Content-Type"]).toBe("application/json");
      expect(options.body).toBe('{"query":"test","limit":10}');
      expect(result).toEqual({ result: "success" });
    });

    it("retries postJson on rate limit error", async () => {
      vi.spyOn(client as never, "delay" as never).mockResolvedValue(undefined as never);

      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          statusText: "Too Many Requests",
          headers: new Headers({ "Retry-After": "1" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ result: "success" }),
        });
      globalThis.fetch = mockFetch;

      const result = await client.postJson("/api/test", { json: { data: 1 } });

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ result: "success" });
    });

    it("does NOT retry postJson on validation error", async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: "Bad Request",
        json: () => Promise.resolve({ error: { message: "Invalid input" } }),
      });
      globalThis.fetch = mockFetch;

      await expect(client.postJson("/api/test", { json: { invalid: true } })).rejects.toThrow(
        QuerySyntaxError,
      );

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("supports custom headers in postJson", async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ result: "success" }),
      });
      globalThis.fetch = mockFetch;

      await client.postJson("/api/test", {
        json: { data: 1 },
        headers: { "X-API-Key": "secret" },
      });

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers["X-API-Key"]).toBe("secret");
      expect(options.headers["Content-Type"]).toBe("application/json");
    });
  });

  describe("postForm method", () => {
    it("sends POST request with form-urlencoded body", async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ result: "success" }),
      });
      globalThis.fetch = mockFetch;

      const result = await client.postForm<{ result: string }>("/api/test", {
        form: { query: 'search publications for "test"' },
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe("https://app.dimensions.ai/api/test");
      expect(options.method).toBe("POST");
      expect(options.headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
      expect(options.body).toBe("query=search+publications+for+%22test%22");
      expect(result).toEqual({ result: "success" });
    });

    it("encodes multiple form fields correctly", async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ result: "success" }),
      });
      globalThis.fetch = mockFetch;

      await client.postForm("/api/test", {
        form: { field1: "value1", field2: "value2" },
      });

      const [, options] = mockFetch.mock.calls[0];
      expect(options.body).toBe("field1=value1&field2=value2");
    });

    it("retries postForm on server error", async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 503,
          statusText: "Service Unavailable",
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ result: "success" }),
        });
      globalThis.fetch = mockFetch;

      const result = await client.postForm("/api/test", { form: { q: "test" } });

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ result: "success" });
    });

    it("supports custom timeout in postForm", async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ result: "success" }),
      });
      globalThis.fetch = mockFetch;

      await client.postForm("/api/test", {
        form: { q: "test" },
        timeout: 60000,
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe("custom timeout in request options", () => {
    it("uses custom timeout in GET request", async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: "result" }),
      });
      globalThis.fetch = mockFetch;

      await client.get("/api/test", { timeout: 60000 });

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("uses custom timeout in postJson request", async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ result: "success" }),
      });
      globalThis.fetch = mockFetch;

      await client.postJson("/api/test", {
        json: { data: 1 },
        timeout: 60000,
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe("rate limiting integration", () => {
    it("calls waitIfNeeded before request and recordRequest after success", async () => {
      const rateLimiter = new RateLimiter({ maxRequests: 10, windowMs: 60_000 });
      const waitSpy = vi.spyOn(rateLimiter, "waitIfNeeded");
      const recordSpy = vi.spyOn(rateLimiter, "recordRequest");

      const rateLimitedClient = new HttpClient({
        baseUrl: "https://app.dimensions.ai",
        authProvider: mockAuthProvider,
        rateLimiter,
      });

      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ _stats: { total_count: 0 } }),
      });
      globalThis.fetch = mockFetch;

      await rateLimitedClient.query("search publications");

      expect(waitSpy).toHaveBeenCalledTimes(1);
      expect(recordSpy).toHaveBeenCalledTimes(1);
    });

    it("does not record request on failure", async () => {
      const rateLimiter = new RateLimiter({ maxRequests: 10, windowMs: 60_000 });
      const recordSpy = vi.spyOn(rateLimiter, "recordRequest");

      const rateLimitedClient = new HttpClient({
        baseUrl: "https://app.dimensions.ai",
        authProvider: mockAuthProvider,
        maxRetries: 0,
        rateLimiter,
      });

      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: "Bad Request",
        json: () => Promise.resolve({ error: { message: "Syntax error" } }),
      });
      globalThis.fetch = mockFetch;

      await rateLimitedClient.query("bad query").catch(() => {});

      expect(recordSpy).not.toHaveBeenCalled();
    });

    it("calls waitIfNeeded before each retry attempt", async () => {
      const rateLimiter = new RateLimiter({ maxRequests: 10, windowMs: 60_000 });
      const waitSpy = vi.spyOn(rateLimiter, "waitIfNeeded");
      const recordSpy = vi.spyOn(rateLimiter, "recordRequest");

      const rateLimitedClient = new HttpClient({
        baseUrl: "https://app.dimensions.ai",
        authProvider: mockAuthProvider,
        maxRetries: 2,
        retryDelay: 10,
        rateLimiter,
      });

      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: "Internal Server Error",
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ _stats: { total_count: 0 } }),
        });
      globalThis.fetch = mockFetch;

      await rateLimitedClient.query("search publications");

      // waitIfNeeded called before initial attempt and before retry
      expect(waitSpy).toHaveBeenCalledTimes(2);
      // recordRequest called only on final success
      expect(recordSpy).toHaveBeenCalledTimes(1);
    });

    it("works without rate limiter", async () => {
      const clientWithoutLimiter = new HttpClient({
        baseUrl: "https://app.dimensions.ai",
        authProvider: mockAuthProvider,
      });

      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ _stats: { total_count: 0 } }),
      });
      globalThis.fetch = mockFetch;

      const result = await clientWithoutLimiter.query("search publications");

      expect(result).toEqual({ _stats: { total_count: 0 } });
    });

    it("records request correctly across all HTTP methods", async () => {
      const rateLimiter = new RateLimiter({ maxRequests: 10, windowMs: 60_000 });
      const recordSpy = vi.spyOn(rateLimiter, "recordRequest");

      const rateLimitedClient = new HttpClient({
        baseUrl: "https://app.dimensions.ai",
        authProvider: mockAuthProvider,
        rateLimiter,
      });

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: "ok" }),
      });
      globalThis.fetch = mockFetch;

      await rateLimitedClient.query("search publications");
      await rateLimitedClient.get("/api/test");
      await rateLimitedClient.postJson("/api/test", { json: {} });
      await rateLimitedClient.postForm("/api/test", { form: { q: "test" } });

      expect(recordSpy).toHaveBeenCalledTimes(4);
    });
  });
});
