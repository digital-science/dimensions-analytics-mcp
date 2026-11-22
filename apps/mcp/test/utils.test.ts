/**
 * @module test/utils
 */

import { describe, expect, it } from "vitest";
import { RateLimitError } from "../src/dsl/index.js";
import { formatErrorPayload, formatErrorResult, formatToolResult } from "../src/mcp/utils.js";

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

  it("strips invisible characters from error messages", () => {
    const payload = formatErrorPayload(new Error("boom\u202Edrop"));
    expect(payload.error).toBe("boomdrop");
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

describe("formatToolResult", () => {
  it("keeps both channels in agreement", () => {
    const result = formatToolResult({ totalCount: 1, publications: [{ id: "pub.1" }] });
    expect(JSON.parse(result.content[0].text)).toEqual(result.structuredContent);
  });

  it("strips invisible characters from both channels", () => {
    const poisoned = {
      publications: [{ title: "Normal\u200Btitle", abstract: "a\u202Eb" }],
    };

    const result = formatToolResult(poisoned);

    expect(result.content[0].text).not.toContain("\u200B");
    expect(result.content[0].text).not.toContain("\u202E");
    const structured = JSON.stringify(result.structuredContent);
    expect(structured).not.toContain("\u200B");
    expect(structured).not.toContain("\u202E");
    expect(result.content[0].text).toContain("Normaltitle");
  });

  it("passes a clean payload through by reference", () => {
    const clean = { totalCount: 0, publications: [] };
    expect(formatToolResult(clean).structuredContent).toBe(clean);
  });
});
