/**
 * @module test/utils
 */

import { describe, expect, it } from "vitest";
import { RateLimitError } from "../src/dsl/index.js";
import { formatErrorPayload, formatErrorResult } from "../src/mcp/utils.js";

describe("formatErrorPayload", () => {
  it("serializes RateLimitError with client rate-limit info", () => {
    const error = new RateLimitError("Rate limit exceeded", 3, {
      remaining: 0,
      retryAfterMs: 2050,
    });

    const payload = formatErrorPayload(error);

    expect(payload.type).toBe("RateLimitError");
    expect(payload.name).toBe("RateLimitError");
    expect(payload.error).toBe("Rate limit exceeded");
    expect(payload.statusCode).toBe(429);
    expect(payload.retryAfter).toBe(3);
    expect(payload.clientRateLimit).toEqual({
      remaining: 0,
      retryAfterMs: 2050,
    });
  });

  it("falls back for generic errors", () => {
    expect(formatErrorPayload(new Error("boom"))).toEqual({
      error: "boom",
      type: "Error",
    });
  });
});

describe("formatErrorResult", () => {
  it("marks tool results as errors", () => {
    const result = formatErrorResult(new RateLimitError("Rate limit exceeded", 5));
    expect(result.isError).toBe(true);
    const parsed = JSON.parse(result.content[0].text) as Record<string, unknown>;
    expect(parsed.name).toBe("RateLimitError");
    expect(parsed.retryAfter).toBe(5);
  });
});
