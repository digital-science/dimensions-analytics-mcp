/**
 * Shared retry logic for Dimensions HTTP clients (public API and dsl-service).
 * @module client/request-retry
 */

import { NetworkError, RateLimitError, ServerError, TimeoutError } from "./errors.js";
import type { RateLimiter } from "./rate-limiter.js";

export interface RequestRetryOptions {
  readonly maxRetries: number;
  readonly retryDelay: number;
  readonly rateLimiter?: RateLimiter;
  /** Retries allowed for 429 responses, within maxRetries (default 1). */
  readonly maxRateLimitRetries?: number;
}

/**
 * Longest 429 wait retried inside a request. Longer waits fail fast so the AI client
 * sees "retry after N seconds" instead of a tool call that hangs (WEBAPPDEV-14210).
 */
export const MAX_RATE_LIMIT_RETRY_WAIT_MS = 10_000;

/**
 * Parses an HTTP `Retry-After` header (delta-seconds or HTTP-date).
 * @param value - Header value
 * @param now - Current time in ms (for HTTP-date values)
 * @returns Wait in milliseconds, or `undefined` when absent or unparseable
 */
export function parseRetryAfterMs(
  value: string | null | undefined,
  now: number = Date.now(),
): number | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  if (/^\d+$/.test(trimmed)) {
    return Number.parseInt(trimmed, 10) * 1000;
  }
  const date = Date.parse(trimmed);
  return Number.isNaN(date) ? undefined : Math.max(0, date - now);
}

/**
 * Builds the error for a 429 response, preferring the server's `Retry-After` over
 * the client-side throttling estimate.
 * @param response - The 429 response
 * @param rateLimiter - Client-side rate limiter, when configured
 */
export function rateLimitErrorFromResponse(
  response: Pick<Response, "headers">,
  rateLimiter?: RateLimiter,
): RateLimitError {
  const clientRetryAfterMs = rateLimiter?.getRetryDelayMs() ?? 2000;
  const serverRetryAfterMs = parseRetryAfterMs(response.headers?.get("retry-after"));
  const retryAfterSeconds = Math.ceil((serverRetryAfterMs ?? clientRetryAfterMs) / 1000);
  return new RateLimitError(
    `Rate limit exceeded — retry after ${retryAfterSeconds} seconds`,
    retryAfterSeconds,
    {
      remaining: rateLimiter?.getRemainingRequests() ?? 0,
      retryAfterMs: clientRetryAfterMs,
    },
    serverRetryAfterMs,
  );
}

type DelayFn = (ms: number) => Promise<void>;

let delayFn: DelayFn = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Delays before the next retry attempt. Exported for unit tests.
 */
export async function requestRetryDelay(ms: number): Promise<void> {
  return delayFn(ms);
}

/**
 * Overrides retry delay behaviour in unit tests.
 * @internal
 */
export function setRequestRetryDelayFn(fn: DelayFn): void {
  delayFn = fn;
}

/**
 * Restores default retry delay behaviour after tests.
 * @internal
 */
export function resetRequestRetryDelayFn(): void {
  delayFn = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Returns true when a failed request should be retried.
 */
export function isRetryableRequestError(error: unknown): boolean {
  if (error instanceof RateLimitError) {
    return true;
  }
  if (error instanceof ServerError) {
    return true;
  }
  if (error instanceof NetworkError) {
    return true;
  }
  if (error instanceof TimeoutError) {
    return true;
  }
  return false;
}

/**
 * Calculates delay before the next retry (rate-limit aware, exponential backoff with jitter).
 */
export function calculateRequestRetryDelay(
  error: unknown,
  attempt: number,
  options: Pick<RequestRetryOptions, "retryDelay" | "rateLimiter">,
): number {
  const MAX_DELAY = 60_000;

  if (error instanceof RateLimitError) {
    const delay =
      error.serverRetryAfterMs ??
      error.clientRateLimit?.retryAfterMs ??
      options.rateLimiter?.getRetryDelayMs() ??
      2000 * 2 ** attempt;
    return Math.min(delay, MAX_DELAY);
  }

  const backoff = options.retryDelay * 2 ** attempt * (0.5 + Math.random() * 0.5);
  return Math.min(backoff, MAX_DELAY);
}

/**
 * Executes a request with client-side throttling and retries for transient failures.
 */
export async function executeRequestWithRetry<T>(
  requestFn: () => Promise<T>,
  options: RequestRetryOptions,
): Promise<T> {
  let lastError: Error | null = null;
  const maxRateLimitRetries = options.maxRateLimitRetries ?? 1;
  let rateLimitRetries = 0;

  for (let attempt = 0; attempt <= options.maxRetries; attempt++) {
    await options.rateLimiter?.waitIfNeeded();
    try {
      const result = await requestFn();
      options.rateLimiter?.recordRequest();
      return result;
    } catch (error) {
      lastError = error as Error;

      if (!isRetryableRequestError(error)) {
        throw error;
      }

      if (attempt >= options.maxRetries) {
        throw error;
      }

      const retryDelay = calculateRequestRetryDelay(error, attempt, options);
      if (error instanceof RateLimitError) {
        if (rateLimitRetries >= maxRateLimitRetries || retryDelay > MAX_RATE_LIMIT_RETRY_WAIT_MS) {
          throw error;
        }
        rateLimitRetries++;
      }
      await requestRetryDelay(retryDelay);
    }
  }

  throw lastError ?? new NetworkError("Unknown error occurred");
}
