/**
 * @module test/schema/load
 */

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DimensionsClient } from "../../../src/dsl/client.js";
import {
  DEFAULT_SCHEMA_CACHE_TTL_MS,
  parseCachePayload,
  writeSchemaCacheFile,
} from "../../../src/dsl/schema/cache.js";
import { clearSchemaCache, loadSchema } from "../../../src/dsl/schema/load.js";

const liveSchema = {
  sources: { publications: { fields: { year: { type: "int", is_filter: true } } } },
  entities: { journals: { fields: { title: { type: "string", is_filter: true } } } },
};

function createMockClient(handlers: {
  schema?: () => Promise<unknown>;
  version?: () => Promise<unknown>;
}): DimensionsClient {
  return {
    rawQuery: vi.fn(async (dsl: string) => {
      if (dsl === "describe schema") {
        if (!handlers.schema) throw new Error("schema fetch failed");
        return handlers.schema();
      }
      if (dsl === "describe version") {
        if (!handlers.version) throw new Error("version fetch failed");
        return handlers.version();
      }
      throw new Error(`unexpected query: ${dsl}`);
    }),
  } as unknown as DimensionsClient;
}

describe("loadSchema", () => {
  let cacheDir: string;
  let cachePath: string;

  beforeEach(async () => {
    clearSchemaCache();
    cacheDir = await mkdtemp(join(tmpdir(), "dsl-schema-cache-"));
    cachePath = join(cacheDir, "schema.json");
  });

  afterEach(async () => {
    clearSchemaCache();
    await rm(cacheDir, { recursive: true, force: true });
  });

  it("loads from API and writes cache envelope", async () => {
    const client = createMockClient({
      schema: async () => liveSchema,
      version: async () => ({ version: "2.15.0" }),
    });

    const store = await loadSchema(client, { cachePath, log: false });
    expect(store.loadSource).toBe("api");
    expect(store.stale).toBe(false);
    expect(store.version).toBe("2.15.0");

    const onDisk = parseCachePayload(JSON.parse(await readFile(cachePath, "utf8")));
    expect(onDisk?.cachedAt).toBeDefined();
    expect(onDisk?.version).toBe("2.15.0");
  });

  it("uses fresh cache without calling the API", async () => {
    const seedClient = createMockClient({
      schema: async () => liveSchema,
      version: async () => ({ version: "2.15.0" }),
    });
    await loadSchema(seedClient, { cachePath, log: false });

    clearSchemaCache();
    const cachedClient = createMockClient({
      schema: async () => {
        throw new Error("should not fetch schema");
      },
    });

    const store = await loadSchema(cachedClient, {
      cachePath,
      cacheTtlMs: DEFAULT_SCHEMA_CACHE_TTL_MS,
      log: false,
    });

    expect(store.loadSource).toBe("cache");
    expect(store.stale).toBe(false);
    expect(cachedClient.rawQuery).not.toHaveBeenCalled();
  });

  it("refreshes expired cache from the API", async () => {
    await writeSchemaCacheFile(cachePath, liveSchema, "2.14.0");
    const envelope = JSON.parse(await readFile(cachePath, "utf8")) as Record<string, unknown>;
    envelope.cachedAt = new Date(Date.now() - DEFAULT_SCHEMA_CACHE_TTL_MS - 1000).toISOString();
    await writeFile(cachePath, JSON.stringify(envelope), "utf8");

    clearSchemaCache();
    const client = createMockClient({
      schema: async () => ({
        ...liveSchema,
        sources: {
          ...liveSchema.sources,
          grants: { fields: { title: { type: "string", is_filter: true } } },
        },
      }),
      version: async () => ({ version: "2.15.0" }),
    });

    const store = await loadSchema(client, { cachePath, log: false });

    expect(store.loadSource).toBe("api");
    expect(store.version).toBe("2.15.0");
    expect(store.sourceNames()).toContain("grants");
  });

  it("falls back to stale cache when the API is unavailable", async () => {
    await writeSchemaCacheFile(cachePath, liveSchema, "2.15.0");
    const envelope = JSON.parse(await readFile(cachePath, "utf8")) as Record<string, unknown>;
    envelope.cachedAt = new Date(Date.now() - DEFAULT_SCHEMA_CACHE_TTL_MS - 1000).toISOString();
    await writeFile(cachePath, JSON.stringify(envelope), "utf8");

    clearSchemaCache();
    const failingClient = createMockClient({
      schema: async () => {
        throw new Error("network down");
      },
    });

    const store = await loadSchema(failingClient, { cachePath, log: false });

    expect(store.loadSource).toBe("cache");
    expect(store.stale).toBe(true);
    expect(store.version).toBe("2.15.0");
  });

  it("forceRefresh bypasses fresh cache", async () => {
    const seedClient = createMockClient({
      schema: async () => liveSchema,
      version: async () => ({ version: "2.14.0" }),
    });
    await loadSchema(seedClient, { cachePath, log: false });

    clearSchemaCache();
    const refreshClient = createMockClient({
      schema: async () => liveSchema,
      version: async () => ({ version: "2.15.0" }),
    });

    const store = await loadSchema(refreshClient, {
      cachePath,
      forceRefresh: true,
      log: false,
    });

    expect(store.loadSource).toBe("api");
    expect(store.version).toBe("2.15.0");
    expect(refreshClient.rawQuery).toHaveBeenCalled();
  });
});
