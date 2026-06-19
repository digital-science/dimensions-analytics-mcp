import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { Command, NetworkError, ValidationError } from "../../src/client/index.js";
import { DimensionsClient } from "../../src/dsl/client.js";
import { FluentQueryBuilder } from "../../src/dsl/fluent-query-builder.js";

/**
 * Test command for testing the client.
 */
class TestSearchCommand extends Command<{ query: string }, { results: string[] }> {
  static readonly inputSchema = z.object({
    query: z.string().min(1),
  });

  readonly input: { query: string };

  constructor(input: { query: string }) {
    super();
    const validated = TestSearchCommand.inputSchema.parse(input);
    this.input = validated;
  }

  resolveQuery(): string {
    return `search publications for "${this.input.query}"`;
  }

  transformResponse(response: unknown): { results: string[] } {
    const data = response as { publications?: Array<{ title: string }> };
    return {
      results: data.publications?.map((p) => p.title) ?? [],
    };
  }
}

describe("DimensionsClient", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe("configuration validation", () => {
    it("throws ValidationError for missing API key", () => {
      expect(() => new DimensionsClient({ apiKey: "" })).toThrow(ValidationError);
    });

    it("throws ValidationError for invalid baseUrl", () => {
      expect(() => new DimensionsClient({ apiKey: "test-key", baseUrl: "not-a-url" })).toThrow(
        ValidationError,
      );
    });

    it("throws ValidationError for negative timeout", () => {
      expect(() => new DimensionsClient({ apiKey: "test-key", timeout: -1 })).toThrow(
        ValidationError,
      );
    });

    it("throws ValidationError for negative maxRetries", () => {
      expect(() => new DimensionsClient({ apiKey: "test-key", maxRetries: -1 })).toThrow(
        ValidationError,
      );
    });

    it("throws ValidationError for negative retryDelay", () => {
      expect(() => new DimensionsClient({ apiKey: "test-key", retryDelay: -1 })).toThrow(
        ValidationError,
      );
    });

    it("throws ValidationError for non-positive rateLimitPerMinute", () => {
      expect(() => new DimensionsClient({ apiKey: "test-key", rateLimitPerMinute: 0 })).toThrow(
        ValidationError,
      );
    });

    it("accepts valid configuration with defaults", () => {
      const client = new DimensionsClient({ apiKey: "test-key" });
      expect(client).toBeInstanceOf(DimensionsClient);
    });

    it("accepts valid configuration with custom values", () => {
      const client = new DimensionsClient({
        apiKey: "test-key",
        baseUrl: "https://custom.api.com",
        timeout: 60000,
        maxRetries: 5,
        retryDelay: 2000,
        rateLimitPerMinute: 60,
      });
      expect(client).toBeInstanceOf(DimensionsClient);
    });
  });

  describe("send()", () => {
    let client: DimensionsClient;

    beforeEach(() => {
      client = new DimensionsClient({
        apiKey: "test-api-key",
        rateLimitPerMinute: 100, // High limit for tests
        retryDelay: 1, // Minimal delay for fast tests
      });
    });

    it("sends command and returns transformed response", async () => {
      // Mock auth endpoint
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ token: "eyJhbGc.eyJzdWI.dGVzdA" }),
        })
        // Mock DSL endpoint
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              _stats: { total_count: 2 },
              publications: [{ title: "Paper One" }, { title: "Paper Two" }],
            }),
        });
      globalThis.fetch = mockFetch;

      const command = new TestSearchCommand({ query: "machine learning" });
      const result = await client.send(command);

      expect(result).toEqual({ results: ["Paper One", "Paper Two"] });
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("acquires auth token before making request", async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ token: "eyJhbGc.eyJzdWI.dGVzdA" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              publications: [],
            }),
        });
      globalThis.fetch = mockFetch;

      const command = new TestSearchCommand({ query: "test" });
      await client.send(command);

      // Check auth request
      const authCall = mockFetch.mock.calls[0];
      expect(authCall[0]).toContain("/api/auth.json");
      expect(authCall[1].body).toContain("test-api-key");

      // Check DSL request has token
      const dslCall = mockFetch.mock.calls[1];
      expect(dslCall[1].headers.Authorization).toBe("JWT eyJhbGc.eyJzdWI.dGVzdA");
    });

    it("propagates errors from HTTP client", async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ token: "eyJhbGc.eyJzdWI.dGVzdA" }),
        })
        .mockRejectedValueOnce(new Error("Network failure"));
      globalThis.fetch = mockFetch;

      const command = new TestSearchCommand({ query: "test" });

      await expect(client.send(command)).rejects.toThrow(NetworkError);
    });

    it("handles command without transformResponse", async () => {
      class SimpleCommand extends Command<{ id: string }, unknown> {
        static readonly inputSchema = z.object({ id: z.string() });
        readonly input: { id: string };

        constructor(input: { id: string }) {
          super();
          this.input = SimpleCommand.inputSchema.parse(input);
        }

        resolveQuery(): string {
          return `search publications where id = "${this.input.id}"`;
        }
        // No transformResponse - should return raw response
      }

      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ token: "eyJhbGc.eyJzdWI.dGVzdA" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              _stats: { total_count: 1 },
              publications: [{ id: "pub.123", title: "Test" }],
            }),
        });
      globalThis.fetch = mockFetch;

      const command = new SimpleCommand({ id: "pub.123" });
      const result = await client.send(command);

      expect(result).toEqual({
        _stats: { total_count: 1 },
        publications: [{ id: "pub.123", title: "Test" }],
      });
    });
  });

  describe("getRateLimitInfo()", () => {
    it("returns rate limit information", () => {
      const client = new DimensionsClient({
        apiKey: "test-key",
        rateLimitPerMinute: 30,
      });

      const info = client.getRateLimitInfo();

      expect(info.remaining).toBe(30);
      expect(typeof info.resetInMs).toBe("number");
      expect(info.resetInMs).toBeGreaterThanOrEqual(0);
    });

    it("updates after requests", async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ token: "eyJhbGc.eyJzdWI.dGVzdA" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ publications: [] }),
        });
      globalThis.fetch = mockFetch;

      const client = new DimensionsClient({
        apiKey: "test-key",
        rateLimitPerMinute: 30,
      });

      const infoBefore = client.getRateLimitInfo();
      expect(infoBefore.remaining).toBe(30);

      const command = new TestSearchCommand({ query: "test" });
      await client.send(command);

      const infoAfter = client.getRateLimitInfo();
      expect(infoAfter.remaining).toBe(29);
    });
  });

  describe("invalidateToken()", () => {
    it("forces token refresh on next request", async () => {
      const mockFetch = vi
        .fn()
        // First auth
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ token: "eyJhbGc.eyJzdWI.dGVzdA" }),
        })
        // First DSL
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ publications: [] }),
        })
        // Second auth (after invalidation)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ token: "eyJhbGc.eyJyZWY.cmVmcg" }),
        })
        // Second DSL
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ publications: [] }),
        });
      globalThis.fetch = mockFetch;

      const client = new DimensionsClient({
        apiKey: "test-key",
        rateLimitPerMinute: 100,
      });

      const command = new TestSearchCommand({ query: "test" });

      // First request
      await client.send(command);

      // Invalidate token
      client.invalidateToken();

      // Second request should fetch new token
      await client.send(command);

      // Should have made 4 calls: auth, dsl, auth, dsl
      expect(mockFetch).toHaveBeenCalledTimes(4);

      // Verify second DSL request uses new token
      const secondDslCall = mockFetch.mock.calls[3];
      expect(secondDslCall[1].headers.Authorization).toBe("JWT eyJhbGc.eyJyZWY.cmVmcg");
    });
  });

  describe("rate limiting integration", () => {
    it("respects rate limits", async () => {
      const mockFetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes("auth")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ token: "eyJhbGc.eyJzdWI.dGVzdA" }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ publications: [] }),
        });
      });
      globalThis.fetch = mockFetch;

      const client = new DimensionsClient({
        apiKey: "test-key",
        rateLimitPerMinute: 5,
      });

      const command = new TestSearchCommand({ query: "test" });

      // Make 5 requests
      for (let i = 0; i < 5; i++) {
        await client.send(command);
      }

      // Should have made 1 auth + 5 DSL requests = 6 total
      expect(mockFetch).toHaveBeenCalledTimes(6);

      // Rate limit info should show 0 remaining
      const info = client.getRateLimitInfo();
      expect(info.remaining).toBe(0);
    });
  });

  describe("fluent API entity methods", () => {
    let client: DimensionsClient;

    beforeEach(() => {
      client = new DimensionsClient({
        apiKey: "test-api-key",
        rateLimitPerMinute: 100,
      });
    });

    it("publications() returns FluentQueryBuilder for publications", () => {
      const builder = client.publications();
      expect(builder).toBeInstanceOf(FluentQueryBuilder);

      // Verify it's configured for publications
      const dsl = builder.for("test").getDsl();
      expect(dsl).toBe('search publications for "test"');
    });

    it("grants() returns FluentQueryBuilder for grants", () => {
      const builder = client.grants();
      expect(builder).toBeInstanceOf(FluentQueryBuilder);

      const dsl = builder.for("test").getDsl();
      expect(dsl).toBe('search grants for "test"');
    });

    it("researchers() returns FluentQueryBuilder for researchers", () => {
      const builder = client.researchers();
      expect(builder).toBeInstanceOf(FluentQueryBuilder);

      const dsl = builder.for("test").getDsl();
      expect(dsl).toBe('search researchers for "test"');
    });

    it("patents() returns FluentQueryBuilder for patents", () => {
      const builder = client.patents();
      expect(builder).toBeInstanceOf(FluentQueryBuilder);

      const dsl = builder.for("test").getDsl();
      expect(dsl).toBe('search patents for "test"');
    });

    it("clinicalTrials() returns FluentQueryBuilder for clinical_trials", () => {
      const builder = client.clinicalTrials();
      expect(builder).toBeInstanceOf(FluentQueryBuilder);

      const dsl = builder.for("test").getDsl();
      expect(dsl).toBe('search clinical_trials for "test"');
    });

    it("datasets() returns FluentQueryBuilder for datasets", () => {
      const builder = client.datasets();
      expect(builder).toBeInstanceOf(FluentQueryBuilder);

      const dsl = builder.for("test").getDsl();
      expect(dsl).toBe('search datasets for "test"');
    });

    it("policyDocuments() returns FluentQueryBuilder for policy_documents", () => {
      const builder = client.policyDocuments();
      expect(builder).toBeInstanceOf(FluentQueryBuilder);

      const dsl = builder.for("test").getDsl();
      expect(dsl).toBe('search policy_documents for "test"');
    });

    it("organizations() returns FluentQueryBuilder for organizations", () => {
      const builder = client.organizations();
      expect(builder).toBeInstanceOf(FluentQueryBuilder);

      const dsl = builder.for("test").getDsl();
      expect(dsl).toBe('search organizations for "test"');
    });

    it("fluent API executes via client.rawQuery", async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ token: "eyJhbGc.eyJzdWI.dGVzdA" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              publications: [{ id: "pub1", title: "Test" }],
              _stats: { total_count: 1 },
            }),
        });
      globalThis.fetch = mockFetch;

      const result = await client
        .publications()
        .for("machine learning")
        .where("year", ">=", 2020)
        .execute();

      expect(result.data).toEqual([{ id: "pub1", title: "Test" }]);
      expect(result.totalCount).toBe(1);

      // Verify DSL call (body is raw DSL string)
      const dslCall = mockFetch.mock.calls[1];
      const body = dslCall[1].body as string;
      expect(body).toContain('search publications for "machine learning" where year >= 2020');
    });
  });
});
