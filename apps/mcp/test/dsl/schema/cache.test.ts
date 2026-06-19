/**
 * @module test/schema/cache
 */

import { describe, expect, it } from "vitest";
import {
  DEFAULT_SCHEMA_CACHE_TTL_MS,
  isCacheFresh,
  parseCachePayload,
  resolveCacheTtlMs,
} from "../../../src/dsl/schema/cache.js";

const sampleSchema = {
  sources: { publications: { fields: { year: { type: "int", is_filter: true } } } },
  entities: {},
};

describe("schema cache helpers", () => {
  it("isCacheFresh returns false without cachedAt", () => {
    expect(isCacheFresh(undefined, DEFAULT_SCHEMA_CACHE_TTL_MS)).toBe(false);
  });

  it("isCacheFresh returns true inside TTL window", () => {
    const cachedAt = new Date(Date.now() - 60_000);
    expect(isCacheFresh(cachedAt, DEFAULT_SCHEMA_CACHE_TTL_MS)).toBe(true);
  });

  it("isCacheFresh returns false outside TTL window", () => {
    const cachedAt = new Date(Date.now() - DEFAULT_SCHEMA_CACHE_TTL_MS - 1);
    expect(isCacheFresh(cachedAt, DEFAULT_SCHEMA_CACHE_TTL_MS)).toBe(false);
  });

  it("parseCachePayload reads envelope format", () => {
    const entry = parseCachePayload({
      cachedAt: "2026-01-01T00:00:00.000Z",
      version: "2.15.0",
      schema: sampleSchema,
    });
    expect(entry?.version).toBe("2.15.0");
    expect(entry?.cachedAt?.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(entry?.response.sources.publications).toBeDefined();
  });

  it("parseCachePayload returns undefined for bare describe payloads", () => {
    expect(parseCachePayload(sampleSchema)).toBeUndefined();
  });

  it("resolveCacheTtlMs prefers explicit override", () => {
    expect(resolveCacheTtlMs(5000)).toBe(5000);
  });
});
