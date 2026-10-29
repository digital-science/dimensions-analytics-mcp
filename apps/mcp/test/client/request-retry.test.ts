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
  parseRetryAfterMs,
  rateLimitErrorFromResponse,
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

  it("prefers the server Retry-After over the client estimate", () => {
    const delay = calculateRequestRetryDelay(
      new RateLimitError("limited", 4, { remaining: 0, retryAfterMs: 3500 }, 4000),
      0,
      { retryDelay: 10 },
    );
    expect(delay).toBe(4000);
  });
});

describe("parseRetryAfterMs", () => {
  it("parses delta-seconds", () => {
    expect(parseRetryAfterMs("7")).toBe(7000);
    expect(parseRetryAfterMs(" 0 ")).toBe(0);
  });

  it("parses an HTTP-date relative to now", () => {
    const now = Date.parse("2026-10-29T10:00:00Z");
    expect(parseRetryAfterMs("Thu, 29 Oct 2026 10:00:05 GMT", now)).toBe(5000);
    expect(parseRetryAfterMs("Thu, 29 Oct 2026 09:59:00 GMT", now)).toBe(0);
  });

  it("returns undefined when absent or unparseable", () => {
    expect(parseRetryAfterMs(null)).toBeUndefined();
    expect(parseRetryAfterMs("")).toBeUndefined();
    expect(parseRetryAfterMs("soon")).toBeUndefined();
  });
});

describe("rateLimitErrorFromResponse", () => {
  it("tells the caller when to retry, from Retry-After", () => {
    const error = rateLimitErrorFromResponse({ headers: new Headers({ "Retry-After": "12" }) });
    expect(error.message).toBe("Rate limit exceeded — retry after 12 seconds");
    expect(error.retryAfter).toBe(12);
    expect(error.serverRetryAfterMs).toBe(12_000);
  });

  it("falls back to the client estimate without Retry-After", () => {
    const error = rateLimitErrorFromResponse({ headers: new Headers() });
    expect(error.message).toBe("Rate limit exceeded — retry after 2 seconds");
    expect(error.serverRetryAfterMs).toBeUndefined();
  });
});

describe("executeRequestWithRetry rate limits", () => {
  afterEach(() => {
    resetRequestRetryDelayFn();
  });

  it("retries a 429 at most once by default", async () => {
    setRequestRetryDelayFn(async () => {});
    let calls = 0;
    const error = await executeRequestWithRetry(
      async () => {
        calls++;
        throw new RateLimitError("limited", 1, undefined, 1000);
      },
      { maxRetries: 3, retryDelay: 10 },
    ).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(RateLimitError);
    expect(calls).toBe(2);
  });

  it("still retries other transient errors after a rate-limit retry", async () => {
    setRequestRetryDelayFn(async () => {});
    const failures = [
      new RateLimitError("limited", 1, undefined, 1000),
      new ServerError("boom", 502),
      new NetworkError("reset"),
    ];
    const result = await executeRequestWithRetry(
      async () => {
        const next = failures.shift();
        if (next) throw next;
        return "ok";
      },
      { maxRetries: 3, retryDelay: 10 },
    );

    expect(result).toBe("ok");
  });
});
