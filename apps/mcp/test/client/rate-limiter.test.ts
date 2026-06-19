import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RateLimiter } from "../../src/client/rate-limiter.js";

describe("RateLimiter", () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    vi.useFakeTimers();
    limiter = new RateLimiter({ maxRequests: 3, windowMs: 1000 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("constructor validation", () => {
    it("throws on zero maxRequests", () => {
      expect(() => new RateLimiter({ maxRequests: 0, windowMs: 1000 })).toThrow(
        "maxRequests must be positive",
      );
    });

    it("throws on negative maxRequests", () => {
      expect(() => new RateLimiter({ maxRequests: -1, windowMs: 1000 })).toThrow(
        "maxRequests must be positive",
      );
    });

    it("throws on zero windowMs", () => {
      expect(() => new RateLimiter({ maxRequests: 3, windowMs: 0 })).toThrow(
        "windowMs must be positive",
      );
    });

    it("throws on negative windowMs", () => {
      expect(() => new RateLimiter({ maxRequests: 3, windowMs: -100 })).toThrow(
        "windowMs must be positive",
      );
    });
  });

  it("allows requests under limit", () => {
    expect(limiter.canMakeRequest()).toBe(true);
    limiter.recordRequest();
    expect(limiter.canMakeRequest()).toBe(true);
    limiter.recordRequest();
    expect(limiter.canMakeRequest()).toBe(true);
  });

  it("blocks requests over limit", () => {
    limiter.recordRequest();
    limiter.recordRequest();
    limiter.recordRequest();
    expect(limiter.canMakeRequest()).toBe(false);
  });

  it("returns remaining requests", () => {
    expect(limiter.getRemainingRequests()).toBe(3);
    limiter.recordRequest();
    expect(limiter.getRemainingRequests()).toBe(2);
  });

  it("resets after window expires", () => {
    limiter.recordRequest();
    limiter.recordRequest();
    limiter.recordRequest();
    expect(limiter.canMakeRequest()).toBe(false);

    vi.advanceTimersByTime(1100);
    expect(limiter.canMakeRequest()).toBe(true);
  });

  describe("waitIfNeeded", () => {
    it("resolves immediately when under limit", async () => {
      await limiter.waitIfNeeded();
      // No timer advancement needed — resolves synchronously when under limit
    });

    it("waits when rate limited", async () => {
      const fastLimiter = new RateLimiter({ maxRequests: 2, windowMs: 200 });
      fastLimiter.recordRequest();
      fastLimiter.recordRequest();

      const promise = fastLimiter.waitIfNeeded();
      vi.advanceTimersByTime(200);
      await promise;

      // After waiting, a new slot should be available
      expect(fastLimiter.canMakeRequest()).toBe(true);
    });
  });

  describe("getRetryDelayMs", () => {
    it("returns minimum slot spacing when under limit", () => {
      // 30 req/min → ~2000ms spacing + 50ms buffer
      const apiLimiter = new RateLimiter({ maxRequests: 30, windowMs: 60_000 });
      expect(apiLimiter.getRetryDelayMs()).toBe(2050);
    });

    it("returns time until oldest request expires when at limit", () => {
      const fastLimiter = new RateLimiter({ maxRequests: 2, windowMs: 200 });
      fastLimiter.recordRequest();
      fastLimiter.recordRequest();

      const delay = fastLimiter.getRetryDelayMs();
      expect(delay).toBeGreaterThan(50);
      expect(delay).toBeLessThanOrEqual(250);
    });
  });

  describe("getTimeUntilNextSlot", () => {
    it("returns 0 when under limit", () => {
      expect(limiter.getTimeUntilNextSlot()).toBe(0);
    });

    it("returns time until oldest request expires", () => {
      limiter.recordRequest();
      limiter.recordRequest();
      limiter.recordRequest();

      const waitTime = limiter.getTimeUntilNextSlot();
      expect(waitTime).toBeGreaterThan(0);
      expect(waitTime).toBeLessThanOrEqual(1000);
    });

    it("returns 0 after window has passed", () => {
      limiter.recordRequest();
      limiter.recordRequest();
      limiter.recordRequest();

      vi.advanceTimersByTime(1100);

      expect(limiter.getTimeUntilNextSlot()).toBe(0);
    });
  });

  describe("reset", () => {
    it("clears all timestamps", () => {
      limiter.recordRequest();
      limiter.recordRequest();
      limiter.recordRequest();

      expect(limiter.canMakeRequest()).toBe(false);

      limiter.reset();

      expect(limiter.canMakeRequest()).toBe(true);
      expect(limiter.getRemainingRequests()).toBe(3);
    });

    it("allows fresh rate limiting after reset", () => {
      limiter.recordRequest();
      limiter.recordRequest();
      limiter.reset();

      limiter.recordRequest();
      limiter.recordRequest();
      limiter.recordRequest();

      expect(limiter.canMakeRequest()).toBe(false);
      expect(limiter.getRemainingRequests()).toBe(0);
    });
  });

  describe("edge cases", () => {
    it("handles rapid sequential requests", () => {
      for (let i = 0; i < 3; i++) {
        expect(limiter.canMakeRequest()).toBe(true);
        limiter.recordRequest();
      }
      expect(limiter.canMakeRequest()).toBe(false);
    });

    it("handles partial window expiration", () => {
      // Record first request at time 0
      limiter.recordRequest();
      expect(limiter.getRemainingRequests()).toBe(2);

      // Advance to time 500ms, record second request
      vi.advanceTimersByTime(500);
      limiter.recordRequest();
      expect(limiter.getRemainingRequests()).toBe(1);

      // Advance to time 600ms, record third request
      vi.advanceTimersByTime(100);
      limiter.recordRequest();
      expect(limiter.getRemainingRequests()).toBe(0);
      expect(limiter.canMakeRequest()).toBe(false);

      // Advance to time 1100ms - first request (at time 0) should now be expired
      vi.advanceTimersByTime(500);
      expect(limiter.canMakeRequest()).toBe(true);
      expect(limiter.getRemainingRequests()).toBe(1);
    });

    it("never returns negative remaining requests", () => {
      limiter.recordRequest();
      limiter.recordRequest();
      limiter.recordRequest();

      expect(limiter.getRemainingRequests()).toBeGreaterThanOrEqual(0);
    });
  });
});
