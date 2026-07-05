/**
 * Tests for shared request retry helpers.
 * @module test/client/request-retry
 */

import { afterEach, describe, expect, it } from "vitest";
import { NetworkError, RateLimitError, ServerError } from "../../src/client/errors.js";
import {
  calculateRequestRetryDelay,
  executeRequestWithRetry,
  isRetryableRequestError,
  resetRequestRetryDelayFn,
  setRequestRetryDelayFn,
} from "../../src/client/request-retry.js";

describe("request-retry", () => {
  afterEach(() => {
    resetRequestRetryDelayFn();
  });

  it("identifies retryable errors", () => {
    expect(isRetryableRequestError(new RateLimitError())).toBe(true);
    expect(isRetryableRequestError(new ServerError("boom", 500))).toBe(true);
    expect(isRetryableRequestError(new NetworkError("net"))).toBe(true);
    expect(isRetryableRequestError(new Error("nope"))).toBe(false);
  });

  it("retries transient failures then succeeds", async () => {
    setRequestRetryDelayFn(async () => {});

    let calls = 0;
    const result = await executeRequestWithRetry(
      async () => {
        calls += 1;
        if (calls < 2) {
          throw new ServerError("temporary", 503);
        }
        return "ok";
      },
      { maxRetries: 2, retryDelay: 10 },
    );

    expect(result).toBe("ok");
    expect(calls).toBe(2);
  });

  it("uses rate-limit retry delay when provided on the error", () => {
    const delay = calculateRequestRetryDelay(
      new RateLimitError("limited", 2, { remaining: 0, retryAfterMs: 3500 }),
      0,
      { retryDelay: 10 },
    );
    expect(delay).toBe(3500);
  });
});
