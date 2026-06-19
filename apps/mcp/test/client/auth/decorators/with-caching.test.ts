import { afterEach, describe, expect, it, vi } from "vitest";
import { withCaching } from "../../../../src/client/auth/decorators/with-caching.js";
import type { AuthProvider } from "../../../../src/client/auth/types.js";

/**
 * Creates a mock auth provider for testing.
 */
function createMockProvider(
  headers: Record<string, string> = { Authorization: "Bearer test" },
): AuthProvider & {
  getHeaders: ReturnType<typeof vi.fn>;
  refresh: ReturnType<typeof vi.fn>;
  invalidate: ReturnType<typeof vi.fn>;
  initialize: ReturnType<typeof vi.fn>;
} {
  return {
    type: "jwt",
    initialize: vi.fn().mockResolvedValue(undefined),
    getHeaders: vi.fn().mockResolvedValue(headers),
    refresh: vi.fn().mockResolvedValue(undefined),
    invalidate: vi.fn(),
  };
}

describe("withCaching", () => {
  describe("basic caching", () => {
    it("caches headers and reuses them", async () => {
      const mockProvider = createMockProvider();
      // Use cache duration longer than minimum buffer (60s) to ensure caching works
      const cachedProvider = withCaching(mockProvider, {
        cacheDurationMs: 300000, // 5 minutes
      });

      // First call should fetch headers
      await cachedProvider.getHeaders();
      expect(mockProvider.getHeaders).toHaveBeenCalledTimes(1);

      // Second call should use cache (within TTL)
      await cachedProvider.getHeaders();
      expect(mockProvider.getHeaders).toHaveBeenCalledTimes(1);

      // Third call still cached
      await cachedProvider.getHeaders();
      expect(mockProvider.getHeaders).toHaveBeenCalledTimes(1);
    });

    it("returns correct headers", async () => {
      const mockProvider = createMockProvider({ Authorization: "Bearer xyz" });
      const cachedProvider = withCaching(mockProvider);

      const headers = await cachedProvider.getHeaders();

      expect(headers).toEqual({ Authorization: "Bearer xyz" });
    });
  });

  describe("concurrent request deduplication", () => {
    it("deduplicates concurrent getHeaders calls", async () => {
      const mockProvider = createMockProvider();
      // Add delay to simulate network request
      mockProvider.getHeaders.mockImplementation(
        () =>
          new Promise((resolve) => setTimeout(() => resolve({ Authorization: "Bearer test" }), 50)),
      );

      // Use cache duration longer than minimum buffer (60s)
      const cachedProvider = withCaching(mockProvider, {
        cacheDurationMs: 300000,
      });

      // Fire multiple concurrent requests
      const [result1, result2, result3] = await Promise.all([
        cachedProvider.getHeaders(),
        cachedProvider.getHeaders(),
        cachedProvider.getHeaders(),
      ]);

      // All should return same result
      expect(result1).toEqual(result2);
      expect(result2).toEqual(result3);

      // But getHeaders should only be called once
      expect(mockProvider.getHeaders).toHaveBeenCalledTimes(1);
    });
  });

  describe("refresh method", () => {
    it("clears cache and forces re-fetch", async () => {
      const mockProvider = createMockProvider();
      // Use cache duration longer than minimum buffer (60s)
      const cachedProvider = withCaching(mockProvider, {
        cacheDurationMs: 300000,
      });

      await cachedProvider.getHeaders();
      expect(mockProvider.getHeaders).toHaveBeenCalledTimes(1);

      await cachedProvider.refresh();

      await cachedProvider.getHeaders();
      expect(mockProvider.getHeaders).toHaveBeenCalledTimes(2);
    });
  });

  describe("invalidate method", () => {
    it("clears cache and calls underlying invalidate", async () => {
      const mockProvider = createMockProvider();
      // Use cache duration longer than minimum buffer (60s)
      const cachedProvider = withCaching(mockProvider, {
        cacheDurationMs: 300000,
      });

      await cachedProvider.getHeaders();
      expect(mockProvider.getHeaders).toHaveBeenCalledTimes(1);

      cachedProvider.invalidate();
      expect(mockProvider.invalidate).toHaveBeenCalledTimes(1);

      // Next getHeaders should fetch again (cache was cleared)
      await cachedProvider.getHeaders();
      expect(mockProvider.getHeaders).toHaveBeenCalledTimes(2);
    });
  });

  describe("initialize method", () => {
    it("delegates to underlying provider", async () => {
      const mockProvider = createMockProvider();
      const cachedProvider = withCaching(mockProvider);

      await cachedProvider.initialize();

      expect(mockProvider.initialize).toHaveBeenCalledTimes(1);
    });
  });

  describe("type property", () => {
    it("returns underlying provider type", () => {
      const mockProvider = createMockProvider();
      const cachedProvider = withCaching(mockProvider);

      expect(cachedProvider.type).toBe("jwt");
    });
  });

  describe("fetchHeaders does not call refresh", () => {
    it("only calls provider.getHeaders(), not provider.refresh()", async () => {
      const mockProvider = createMockProvider();
      const cachedProvider = withCaching(mockProvider, {
        cacheDurationMs: 300000,
      });

      await cachedProvider.getHeaders();

      expect(mockProvider.getHeaders).toHaveBeenCalledTimes(1);
      expect(mockProvider.refresh).not.toHaveBeenCalled();
    });
  });

  describe("error propagation", () => {
    it("propagates errors from underlying provider", async () => {
      const mockProvider = createMockProvider();
      mockProvider.getHeaders.mockRejectedValue(new Error("Auth failed"));

      const cachedProvider = withCaching(mockProvider);

      await expect(cachedProvider.getHeaders()).rejects.toThrow("Auth failed");
    });

    it("does not cache failed requests", async () => {
      const mockProvider = createMockProvider();
      mockProvider.getHeaders
        .mockRejectedValueOnce(new Error("Auth failed"))
        .mockResolvedValueOnce({ Authorization: "Bearer test" });

      const cachedProvider = withCaching(mockProvider);

      await expect(cachedProvider.getHeaders()).rejects.toThrow("Auth failed");

      // Retry should work
      const headers = await cachedProvider.getHeaders();
      expect(headers).toEqual({ Authorization: "Bearer test" });
      expect(mockProvider.getHeaders).toHaveBeenCalledTimes(2);
    });
  });

  describe("failure backoff", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it("returns stale cache during backoff period after failure", async () => {
      vi.useFakeTimers();
      const mockProvider = createMockProvider();
      // Use very short cache that expires quickly (expiryBuffer=0.9 means 10% of 100ms = 10ms effective)
      const cachedProvider = withCaching(mockProvider, {
        cacheDurationMs: 100,
        expiryBuffer: 0.9, // Cache expires after ~10ms
        failureBackoffMs: 200,
        failureBackoffJitter: 0,
      });

      // First call populates cache
      await cachedProvider.getHeaders();
      expect(mockProvider.getHeaders).toHaveBeenCalledTimes(1);

      // Advance past cache expiry
      vi.advanceTimersByTime(120);

      // Make getHeaders fail on next call
      mockProvider.getHeaders.mockRejectedValueOnce(new Error("Auth failed"));

      await expect(cachedProvider.getHeaders()).rejects.toThrow("Auth failed");
      expect(mockProvider.getHeaders).toHaveBeenCalledTimes(2);

      // During backoff, should return stale cache (no new fetch attempt)
      const headers = await cachedProvider.getHeaders();
      expect(headers).toEqual({ Authorization: "Bearer test" });
      // Should NOT have called getHeaders again (within backoff)
      expect(mockProvider.getHeaders).toHaveBeenCalledTimes(2);
    });

    it("allows retry after backoff period expires", async () => {
      vi.useFakeTimers();
      const mockProvider = createMockProvider();
      const cachedProvider = withCaching(mockProvider, {
        cacheDurationMs: 100,
        expiryBuffer: 0.9,
        failureBackoffMs: 50,
        failureBackoffJitter: 0,
      });

      // First call populates cache
      await cachedProvider.getHeaders();

      // Advance past cache expiry
      vi.advanceTimersByTime(120);

      // Make getHeaders fail on next call
      mockProvider.getHeaders.mockRejectedValueOnce(new Error("Auth failed"));
      await expect(cachedProvider.getHeaders()).rejects.toThrow("Auth failed");

      // Advance past backoff period
      vi.advanceTimersByTime(60);

      // Now it should retry
      mockProvider.getHeaders.mockResolvedValueOnce({
        Authorization: "Bearer new-token",
      });

      const headers = await cachedProvider.getHeaders();
      expect(headers).toEqual({ Authorization: "Bearer new-token" });
      expect(mockProvider.getHeaders).toHaveBeenCalledTimes(3);
    });

    it("invalidate() clears backoff state", async () => {
      vi.useFakeTimers();
      const mockProvider = createMockProvider();
      const cachedProvider = withCaching(mockProvider, {
        cacheDurationMs: 100,
        expiryBuffer: 0.9,
        failureBackoffMs: 500, // Long backoff that we'll clear
        failureBackoffJitter: 0,
      });

      // First call populates cache
      await cachedProvider.getHeaders();

      // Advance past cache expiry
      vi.advanceTimersByTime(120);

      // Make getHeaders fail on next call
      mockProvider.getHeaders.mockRejectedValueOnce(new Error("Auth failed"));
      await expect(cachedProvider.getHeaders()).rejects.toThrow("Auth failed");

      // Invalidate should clear backoff
      cachedProvider.invalidate();

      // Should retry immediately (backoff cleared)
      mockProvider.getHeaders.mockResolvedValueOnce({
        Authorization: "Bearer new-token",
      });

      const headers = await cachedProvider.getHeaders();
      expect(headers).toEqual({ Authorization: "Bearer new-token" });
      expect(mockProvider.getHeaders).toHaveBeenCalledTimes(3);
    });

    it("refresh() clears backoff state", async () => {
      vi.useFakeTimers();
      const mockProvider = createMockProvider();
      const cachedProvider = withCaching(mockProvider, {
        cacheDurationMs: 100,
        expiryBuffer: 0.9,
        failureBackoffMs: 500, // Long backoff that we'll clear
        failureBackoffJitter: 0,
      });

      // First call populates cache
      await cachedProvider.getHeaders();

      // Advance past cache expiry
      vi.advanceTimersByTime(120);

      // Make getHeaders fail on next call
      mockProvider.getHeaders.mockRejectedValueOnce(new Error("Auth failed"));
      await expect(cachedProvider.getHeaders()).rejects.toThrow("Auth failed");

      // Manual refresh should clear backoff
      await cachedProvider.refresh();

      // Should retry immediately (backoff cleared)
      mockProvider.getHeaders.mockResolvedValueOnce({
        Authorization: "Bearer new-token",
      });

      const headers = await cachedProvider.getHeaders();
      expect(headers).toEqual({ Authorization: "Bearer new-token" });
    });

    it("increases backoff exponentially on consecutive failures", async () => {
      vi.useFakeTimers();
      const mockProvider = createMockProvider();
      const cachedProvider = withCaching(mockProvider, {
        cacheDurationMs: 100,
        expiryBuffer: 0.9,
        failureBackoffMs: 1000,
        failureBackoffFactor: 2,
        failureBackoffJitter: 0,
      });

      // Populate cache then expire it
      await cachedProvider.getHeaders();
      vi.advanceTimersByTime(120);

      // Failure 1: backoff = 1000ms
      mockProvider.getHeaders.mockRejectedValueOnce(new Error("fail"));
      await expect(cachedProvider.getHeaders()).rejects.toThrow("fail");

      // Still in backoff at 999ms — returns stale cache
      vi.advanceTimersByTime(999);
      const stale1 = await cachedProvider.getHeaders();
      expect(stale1).toEqual({ Authorization: "Bearer test" });
      expect(mockProvider.getHeaders).toHaveBeenCalledTimes(2);

      // Past first backoff (1001ms total) — failure 2: backoff = 2000ms
      vi.advanceTimersByTime(2);
      mockProvider.getHeaders.mockRejectedValueOnce(new Error("fail"));
      await expect(cachedProvider.getHeaders()).rejects.toThrow("fail");

      // Still in backoff at 1999ms — returns stale cache
      vi.advanceTimersByTime(1999);
      const stale2 = await cachedProvider.getHeaders();
      expect(stale2).toEqual({ Authorization: "Bearer test" });
      expect(mockProvider.getHeaders).toHaveBeenCalledTimes(3);

      // Past second backoff — success
      vi.advanceTimersByTime(2);
      mockProvider.getHeaders.mockResolvedValueOnce({ Authorization: "Bearer new" });
      const fresh = await cachedProvider.getHeaders();
      expect(fresh).toEqual({ Authorization: "Bearer new" });
    });

    it("caps backoff at failureBackoffMaxMs", async () => {
      vi.useFakeTimers();
      const mockProvider = createMockProvider();
      const cachedProvider = withCaching(mockProvider, {
        cacheDurationMs: 100,
        expiryBuffer: 0.9,
        failureBackoffMs: 1000,
        failureBackoffMaxMs: 4000,
        failureBackoffFactor: 2,
        failureBackoffJitter: 0,
      });

      await cachedProvider.getHeaders();
      vi.advanceTimersByTime(120);

      // 3 failures: windows of 1000ms, 2000ms, 4000ms (hits cap)
      for (let i = 0; i < 3; i++) {
        mockProvider.getHeaders.mockRejectedValueOnce(new Error("fail"));
        await expect(cachedProvider.getHeaders()).rejects.toThrow("fail");
        vi.advanceTimersByTime(5000); // advance past each window
      }

      // 4th failure — window should still be 4000ms (capped)
      mockProvider.getHeaders.mockRejectedValueOnce(new Error("fail"));
      await expect(cachedProvider.getHeaders()).rejects.toThrow("fail");

      // Still in backoff at 3999ms
      vi.advanceTimersByTime(3999);
      const stale = await cachedProvider.getHeaders();
      expect(stale).toEqual({ Authorization: "Bearer test" });

      // Past cap — success
      vi.advanceTimersByTime(2);
      mockProvider.getHeaders.mockResolvedValueOnce({ Authorization: "Bearer new" });
      const fresh = await cachedProvider.getHeaders();
      expect(fresh).toEqual({ Authorization: "Bearer new" });
    });

    it("resets failure count after successful fetch", async () => {
      vi.useFakeTimers();
      const mockProvider = createMockProvider();
      const cachedProvider = withCaching(mockProvider, {
        cacheDurationMs: 100,
        expiryBuffer: 0.9,
        failureBackoffMs: 1000,
        failureBackoffFactor: 2,
        failureBackoffJitter: 0,
      });

      await cachedProvider.getHeaders();
      vi.advanceTimersByTime(120);

      // Two failures escalate: 1000ms, then 2000ms
      mockProvider.getHeaders.mockRejectedValueOnce(new Error("fail"));
      await expect(cachedProvider.getHeaders()).rejects.toThrow("fail");
      vi.advanceTimersByTime(1001);

      mockProvider.getHeaders.mockRejectedValueOnce(new Error("fail"));
      await expect(cachedProvider.getHeaders()).rejects.toThrow("fail");
      vi.advanceTimersByTime(2001);

      // Success — resets failure count
      mockProvider.getHeaders.mockResolvedValueOnce({ Authorization: "Bearer ok" });
      await cachedProvider.getHeaders();

      // Expire new cache
      vi.advanceTimersByTime(120);

      // Next failure should be back to 1000ms (not 4000ms)
      mockProvider.getHeaders.mockRejectedValueOnce(new Error("fail"));
      await expect(cachedProvider.getHeaders()).rejects.toThrow("fail");

      // Still in 1000ms backoff at 999ms
      vi.advanceTimersByTime(999);
      const stale = await cachedProvider.getHeaders();
      expect(stale).toEqual({ Authorization: "Bearer ok" });

      // Past 1000ms — retries
      vi.advanceTimersByTime(2);
      mockProvider.getHeaders.mockResolvedValueOnce({ Authorization: "Bearer fresh" });
      const fresh = await cachedProvider.getHeaders();
      expect(fresh).toEqual({ Authorization: "Bearer fresh" });
    });

    it("respects custom failureBackoffFactor", async () => {
      vi.useFakeTimers();
      const mockProvider = createMockProvider();
      const cachedProvider = withCaching(mockProvider, {
        cacheDurationMs: 100,
        expiryBuffer: 0.9,
        failureBackoffMs: 1000,
        failureBackoffFactor: 3, // 1000ms, 3000ms, 9000ms...
        failureBackoffJitter: 0,
      });

      await cachedProvider.getHeaders();
      vi.advanceTimersByTime(120);

      // Failure 1: 1000ms window
      mockProvider.getHeaders.mockRejectedValueOnce(new Error("fail"));
      await expect(cachedProvider.getHeaders()).rejects.toThrow("fail");
      vi.advanceTimersByTime(1001);

      // Failure 2: 3000ms window (factor=3)
      mockProvider.getHeaders.mockRejectedValueOnce(new Error("fail"));
      await expect(cachedProvider.getHeaders()).rejects.toThrow("fail");

      // Still in backoff at 2999ms
      vi.advanceTimersByTime(2999);
      const stale = await cachedProvider.getHeaders();
      expect(stale).toEqual({ Authorization: "Bearer test" });

      // Past 3000ms — success
      vi.advanceTimersByTime(2);
      mockProvider.getHeaders.mockResolvedValueOnce({ Authorization: "Bearer new" });
      const fresh = await cachedProvider.getHeaders();
      expect(fresh).toEqual({ Authorization: "Bearer new" });
    });
  });
});
