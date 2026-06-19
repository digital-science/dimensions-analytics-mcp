/**
 * Rate limiter using sliding window algorithm.
 * @module core/rate-limiter
 */

/**
 * Configuration options for the rate limiter.
 */
export interface RateLimiterConfig {
  /** Maximum number of requests allowed within the window */
  readonly maxRequests: number;
  /** Time window in milliseconds */
  readonly windowMs: number;
}

/**
 * Implements rate limiting using a sliding window algorithm.
 * Tracks request timestamps and enforces request limits over a rolling time window.
 */
export class RateLimiter {
  private maxRequests: number;
  private readonly windowMs: number;
  private timestamps: number[] = [];

  /**
   * Creates a new RateLimiter instance.
   * @param config - Rate limiter configuration
   * @throws {Error} If maxRequests or windowMs is not positive
   */
  constructor(config: RateLimiterConfig) {
    if (config.maxRequests <= 0) {
      throw new Error("maxRequests must be positive");
    }
    if (config.windowMs <= 0) {
      throw new Error("windowMs must be positive");
    }
    this.maxRequests = config.maxRequests;
    this.windowMs = config.windowMs;
  }

  /**
   * Returns the current `maxRequests` ceiling.
   */
  getMaxRequests(): number {
    return this.maxRequests;
  }

  /**
   * Updates the `maxRequests` ceiling in place. Useful for callers that want
   * to temporarily raise the limit for a high-throughput operation and
   * restore it afterwards. Existing tracked timestamps are kept — only the
   * ceiling moves.
   * @throws {Error} If `n` is not positive
   */
  setMaxRequests(n: number): void {
    if (n <= 0) {
      throw new Error("maxRequests must be positive");
    }
    this.maxRequests = n;
  }

  /**
   * Removes expired timestamps from the tracking array.
   */
  private cleanup(): void {
    const now = Date.now();
    const cutoff = now - this.windowMs;
    this.timestamps = this.timestamps.filter((ts) => ts > cutoff);
  }

  /**
   * Checks if a new request can be made without exceeding the rate limit.
   * @returns True if a request is allowed, false if rate limited
   */
  canMakeRequest(): boolean {
    this.cleanup();
    return this.timestamps.length < this.maxRequests;
  }

  /**
   * Records a request timestamp. Call this when a request is made.
   */
  recordRequest(): void {
    this.timestamps.push(Date.now());
  }

  /**
   * Gets the number of requests remaining in the current window.
   * @returns Number of requests that can still be made
   */
  getRemainingRequests(): number {
    this.cleanup();
    return Math.max(0, this.maxRequests - this.timestamps.length);
  }

  /**
   * Gets the time in milliseconds until the next request slot is available.
   * @returns Time to wait in milliseconds, or 0 if a request can be made now
   */
  getTimeUntilNextSlot(): number {
    this.cleanup();
    if (this.timestamps.length < this.maxRequests) {
      return 0;
    }
    const oldest = this.timestamps[0];
    return Math.max(0, oldest + this.windowMs - Date.now());
  }

  /**
   * Waits until a request slot is available.
   * Use this to automatically throttle requests.
   */
  async waitIfNeeded(): Promise<void> {
    const waitTime = this.getTimeUntilNextSlot();
    if (waitTime > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
  }

  /**
   * Suggested delay before retrying after a 429 from the API.
   * Waits for the oldest in-window request to expire, or one minimum slot spacing.
   * @returns Delay in milliseconds
   */
  getRetryDelayMs(): number {
    const slotWait = this.getTimeUntilNextSlot();
    if (slotWait > 0) {
      return slotWait + 50;
    }
    return Math.ceil(this.windowMs / this.maxRequests) + 50;
  }

  /**
   * Resets the rate limiter, clearing all recorded timestamps.
   */
  reset(): void {
    this.timestamps = [];
  }
}
