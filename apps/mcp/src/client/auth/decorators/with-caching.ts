/**
 * Caching decorator for AuthProvider.
 * @module core/auth/decorators/with-caching
 */

import type { AuthConfig, AuthProvider } from "../types.js";

/**
 * Configuration options for the caching decorator.
 */
export interface CachingOptions {
  /**
   * Cache duration in milliseconds.
   * Headers will be refreshed after this time.
   * @default 3600000 (1 hour)
   */
  cacheDurationMs?: number;

  /**
   * Buffer before expiry to trigger refresh, as a decimal (0-1).
   * E.g., 0.1 means refresh when 90% of TTL has passed.
   * @default 0.1
   */
  expiryBuffer?: number;

  /**
   * Initial backoff delay in milliseconds after a failed fetch.
   * Grows exponentially on consecutive failures up to {@link failureBackoffMaxMs}.
   * @default 1000
   */
  failureBackoffMs?: number;

  /**
   * Maximum backoff delay in milliseconds. Caps exponential growth.
   * @default 60000
   */
  failureBackoffMaxMs?: number;

  /**
   * Multiplication factor applied to the base delay on each consecutive failure.
   * Set to 1 for flat (non-exponential) backoff.
   * @default 2
   */
  failureBackoffFactor?: number;

  /**
   * Jitter as a fraction of the computed delay (0–1), e.g. 0.1 = ±10%.
   * Prevents thundering herd by spreading retry times across clients.
   * Set to 0 for deterministic delays (useful in tests).
   * @default 0.1
   */
  failureBackoffJitter?: number;
}

/** Default cache duration: 1 hour */
const DEFAULT_CACHE_DURATION_MS = 3600000;

/** Default expiry buffer: 10% */
const DEFAULT_EXPIRY_BUFFER = 0.1;

/** Default failure backoff: 1 second */
const DEFAULT_FAILURE_BACKOFF_MS = 1000;

/** Default max backoff delay: 60 seconds */
const DEFAULT_FAILURE_BACKOFF_MAX_MS = 60_000;

/** Default backoff multiplication factor */
const DEFAULT_FAILURE_BACKOFF_FACTOR = 2;

/** Default jitter fraction: ±10% */
const DEFAULT_FAILURE_BACKOFF_JITTER = 0.1;

/**
 * Wraps an AuthProvider with caching behavior.
 *
 * Features:
 * - Caches getHeaders() results with configurable TTL
 * - Deduplicates concurrent calls (reuses in-flight promise)
 * - Calls underlying provider's getHeaders() when cache expires
 * - Propagates errors (no stale fallback)
 * - Implements exponential backoff with jitter after failures to prevent thundering herd
 *
 * @param provider - The AuthProvider to wrap
 * @param options - Caching configuration
 * @returns A new AuthProvider with caching behavior
 *
 * @example
 * ```typescript
 * const baseProvider = new JwtAuthProvider(config);
 * const cachedProvider = withCaching(baseProvider, {
 *   cacheDurationMs: 3600000,    // 1 hour
 *   expiryBuffer: 0.1,           // Refresh at 90% of TTL
 *   failureBackoffMs: 1000,      // Initial backoff: 1s
 *   failureBackoffMaxMs: 60000,  // Cap at 60s
 *   failureBackoffFactor: 2,     // Double each failure: 1s, 2s, 4s, 8s...
 *   failureBackoffJitter: 0.1,   // ±10% jitter
 * });
 *
 * // First call fetches headers
 * const headers1 = await cachedProvider.getHeaders();
 *
 * // Subsequent calls return cached value
 * const headers2 = await cachedProvider.getHeaders();
 * ```
 */
export function withCaching(provider: AuthProvider, options?: CachingOptions): AuthProvider {
  const cacheDurationMs = options?.cacheDurationMs ?? DEFAULT_CACHE_DURATION_MS;
  const expiryBuffer = options?.expiryBuffer ?? DEFAULT_EXPIRY_BUFFER;
  const failureBackoffMs = options?.failureBackoffMs ?? DEFAULT_FAILURE_BACKOFF_MS;
  const failureBackoffMaxMs = options?.failureBackoffMaxMs ?? DEFAULT_FAILURE_BACKOFF_MAX_MS;
  const failureBackoffFactor = options?.failureBackoffFactor ?? DEFAULT_FAILURE_BACKOFF_FACTOR;
  const failureBackoffJitter = options?.failureBackoffJitter ?? DEFAULT_FAILURE_BACKOFF_JITTER;

  let cachedHeaders: Record<string, string> | null = null;
  let cacheExpiry = 0;
  let refreshPromise: Promise<Record<string, string>> | null = null;
  let failureCount = 0;
  let backoffDeadline = 0;

  /**
   * Calculate the effective expiry time with buffer.
   * @param durationMs - Full cache duration
   * @returns Expiry timestamp with buffer applied
   */
  const calculateExpiry = (durationMs: number): number => {
    // Buffer is at least 1 minute, but never more than 90% of duration
    const bufferMs = Math.min(Math.max(durationMs * expiryBuffer, 60000), durationMs * 0.9);
    return Date.now() + durationMs - bufferMs;
  };

  /**
   * Calculates the backoff delay for a given consecutive failure count.
   * Uses exponential backoff with multiplicative jitter.
   * @param count - Number of consecutive failures (must be >= 1)
   * @returns Delay in milliseconds
   */
  const calculateBackoffDelay = (count: number): number => {
    const base = Math.min(
      failureBackoffMs * failureBackoffFactor ** (count - 1),
      failureBackoffMaxMs,
    );
    const jittered = base * (1 + (Math.random() - 0.5) * 2 * failureBackoffJitter);
    return Math.max(0, jittered);
  };

  /**
   * Check if we're in a backoff period after a failure.
   * @returns True if still in backoff period
   */
  const isInBackoffPeriod = (): boolean => {
    if (backoffDeadline === 0) return false;
    return Date.now() < backoffDeadline;
  };

  /**
   * Fetch fresh headers from the underlying provider.
   *
   * Calls getHeaders() directly rather than refresh() + getHeaders().
   * The provider's getHeaders() is self-sufficient (fetches a token when
   * needed), so an explicit refresh() is unnecessary and creates a race
   * window where invalidate() between the two calls triggers a redundant
   * token fetch.
   *
   * @returns Fresh headers
   */
  const fetchHeaders = async (): Promise<Record<string, string>> => {
    try {
      const headers = await provider.getHeaders();
      cachedHeaders = headers;
      cacheExpiry = calculateExpiry(cacheDurationMs);
      failureCount = 0;
      backoffDeadline = 0;
      return headers;
    } catch (error) {
      failureCount += 1;
      backoffDeadline = Date.now() + calculateBackoffDelay(failureCount);
      throw error;
    }
  };

  const wrapper = {
    get type(): AuthConfig["type"] {
      return provider.type;
    },

    async initialize(): Promise<void> {
      await provider.initialize();
    },

    async getHeaders(): Promise<Record<string, string>> {
      // Return cached headers if valid
      if (cachedHeaders && Date.now() < cacheExpiry) {
        return cachedHeaders;
      }

      // If already refreshing, wait for that promise
      if (refreshPromise) {
        return refreshPromise;
      }

      // Check backoff period - if in backoff, rethrow if no cache
      if (isInBackoffPeriod()) {
        if (cachedHeaders) {
          // Return stale cache during backoff rather than failing
          return cachedHeaders;
        }
        // No cache available and in backoff - we must try anyway
      }

      // Fetch new headers
      refreshPromise = fetchHeaders();
      try {
        return await refreshPromise;
      } finally {
        refreshPromise = null;
      }
    },

    async refresh(): Promise<void> {
      cachedHeaders = null;
      cacheExpiry = 0;
      failureCount = 0;
      backoffDeadline = 0;
      await provider.refresh();
    },

    invalidate(): void {
      cachedHeaders = null;
      cacheExpiry = 0;
      failureCount = 0;
      backoffDeadline = 0;
      provider.invalidate();
    },
  };

  return wrapper;
}
