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
      await requestRetryDelay(retryDelay);
    }
  }

  throw lastError ?? new NetworkError("Unknown error occurred");
}
