/**
 * Load schema from the Dimensions API or optional disk cache.
 * @module schema/load
 */

import type { DimensionsClient } from "../client.js";
import {
  isCacheFresh,
  parseCachePayload,
  readSchemaCacheFile,
  resolveCacheTtlMs,
  writeSchemaCacheFile,
} from "./cache.js";
import { extractDescribeSchema, extractDescribeVersion } from "./extract.js";
import snapshot from "./snapshot.json" with { type: "json" };
import { createSchemaStoreFromResponse, type SchemaStore } from "./store.js";

let moduleCache: SchemaStore | undefined;
let moduleLoadPromise: Promise<SchemaStore> | undefined;

/**
 * Returns the module-level cached schema store, if loaded.
 * @returns Cached store or undefined before first load
 */
export function getCachedSchemaStore(): SchemaStore | undefined {
  return moduleCache;
}

/**
 * Clears the module-level schema cache (for tests and refresh).
 */
export function clearSchemaCache(): void {
  moduleCache = undefined;
  moduleLoadPromise = undefined;
}

export type LoadSchemaOptions = {
  /** Optional cache file path (defaults to `SCHEMA_CACHE_PATH` env) */
  cachePath?: string;
  /** Cache TTL in milliseconds (defaults to `SCHEMA_CACHE_TTL_MS` env or 24h) */
  cacheTtlMs?: number;
  /** Skip fresh cache and fetch from the API (stale fallback still applies on failure) */
  forceRefresh?: boolean;
  /** Log load stats to stderr (default true) */
  log?: boolean;
};

/**
 * Fetches schema from the Dimensions API, with TTL-aware cache and stale fallback.
 * @param client - Authenticated Dimensions client
 * @param options - Cache path, TTL, and logging options
 * @returns Loaded schema store
 */
export async function loadSchema(
  client: DimensionsClient,
  options?: LoadSchemaOptions | string,
): Promise<SchemaStore> {
  const resolved =
    typeof options === "string" ? { cachePath: options, log: true as const } : (options ?? {});
  const cachePath = resolved.cachePath ?? process.env.SCHEMA_CACHE_PATH;
  const log = resolved.log ?? true;
  const cacheTtlMs = resolveCacheTtlMs(resolved.cacheTtlMs);
  const forceRefresh = resolved.forceRefresh ?? false;

  const cached = cachePath ? await readSchemaCacheFile(cachePath) : undefined;
  const cacheFresh = cached != null && isCacheFresh(cached.cachedAt, cacheTtlMs);

  if (!forceRefresh && cacheFresh && cached) {
    const store = createSchemaStoreFromResponse(cached.response, cached.version, new Date(), {
      loadSource: "cache",
      stale: false,
      cachedAt: cached.cachedAt,
    });
    moduleCache = store;
    if (log) {
      logSchemaLoaded(store, "cache (fresh)");
    }
    return store;
  }

  try {
    const started = performance.now();
    const [schemaRaw, versionRaw] = await Promise.all([
      client.rawQuery("describe schema"),
      client.rawQuery("describe version").catch(() => undefined),
    ]);

    const response = extractDescribeSchema(schemaRaw);
    const version = versionRaw ? extractDescribeVersion(versionRaw) : undefined;

    if (cachePath) {
      // A read-only or missing cache directory must not fail the schema load.
      await writeSchemaCacheFile(cachePath, response, version).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[schema] could not write cache ${cachePath}: ${message}`);
      });
    }

    const store = createSchemaStoreFromResponse(response, version, new Date(), {
      loadSource: "api",
      stale: false,
    });
    moduleCache = store;
    if (log) {
      const elapsed = Math.round(performance.now() - started);
      logSchemaLoaded(store, `api (${elapsed}ms)`);
    }
    return store;
  } catch (error) {
    if (cached) {
      const store = createSchemaStoreFromResponse(cached.response, cached.version, new Date(), {
        loadSource: "cache",
        stale: true,
        cachedAt: cached.cachedAt,
      });
      moduleCache = store;
      if (log) {
        const age =
          cached.cachedAt != null
            ? `${Math.round((Date.now() - cached.cachedAt.getTime()) / 60_000)}m old`
            : "undated cache";
        console.error(
          `[schema] API unavailable; using stale cache (${age}). ` +
            `Call refresh_schema when the API is reachable.`,
        );
        logSchemaLoaded(store, "cache (stale fallback)");
      }
      return store;
    }
    throw error;
  }
}

/** Schema available immediately, plus an optional background refresh from the API. */
export type ImmediateSchema = {
  readonly store: SchemaStore;
  /** Resolves to the live schema; `undefined` when the immediate store is a fresh cache. */
  readonly refresh?: Promise<SchemaStore>;
};

/**
 * Returns a schema without waiting on the network, so a stdio server can answer
 * `initialize` right away (WEBAPPDEV-14080: Claude Desktop gives up after ~10s,
 * while auth plus `describe schema` can take longer).
 *
 * Uses the disk cache when present (any age), else the schema snapshot bundled
 * with the package. Unless the cache is fresh, also starts an API refresh that
 * rewrites the cache.
 * @param client - Dimensions client used for the background refresh
 * @param options - Cache path, TTL, and logging options
 * @returns Immediate store and optional refresh promise
 */
export async function loadSchemaImmediately(
  client: DimensionsClient,
  options: LoadSchemaOptions = {},
): Promise<ImmediateSchema> {
  const cachePath = options.cachePath ?? process.env.SCHEMA_CACHE_PATH;
  const log = options.log ?? true;
  const cached = cachePath ? await readSchemaCacheFile(cachePath) : undefined;

  if (cached && isCacheFresh(cached.cachedAt, resolveCacheTtlMs(options.cacheTtlMs))) {
    const store = createSchemaStoreFromResponse(cached.response, cached.version, new Date(), {
      loadSource: "cache",
      stale: false,
      cachedAt: cached.cachedAt,
    });
    moduleCache = store;
    if (log) logSchemaLoaded(store, "cache (fresh)");
    return { store };
  }

  const fallback = cached ?? parseCachePayload(snapshot);
  if (!fallback) {
    throw new Error("Bundled schema snapshot is invalid");
  }
  const store = createSchemaStoreFromResponse(fallback.response, fallback.version, new Date(), {
    loadSource: cached ? "cache" : "snapshot",
    stale: true,
    cachedAt: fallback.cachedAt,
  });
  moduleCache = store;
  if (log) logSchemaLoaded(store, cached ? "cache (refreshing)" : "snapshot (refreshing)");

  const refresh = loadSchema(client, { ...options, cachePath, forceRefresh: true });
  return { store, refresh };
}

/**
 * Returns cached schema or loads once per process.
 * @param client - Authenticated Dimensions client
 * @param options - Cache path and logging options
 * @returns Schema store
 */
export async function getOrLoadSchema(
  client: DimensionsClient,
  options?: LoadSchemaOptions | string,
): Promise<SchemaStore> {
  if (moduleCache) {
    return moduleCache;
  }
  if (!moduleLoadPromise) {
    moduleLoadPromise = loadSchema(client, options).finally(() => {
      moduleLoadPromise = undefined;
    });
  }
  return moduleLoadPromise;
}

function logSchemaLoaded(store: SchemaStore, via: string): void {
  const stats = store.stats();
  const flags = [via, store.stale ? "stale" : undefined].filter(Boolean).join(", ");
  console.error(
    `[schema] loaded ${stats.sourceCount} sources, ${stats.entityCount} entities` +
      (stats.dslVersion ? ` (DSL ${stats.dslVersion})` : "") +
      ` [${flags}]`,
  );
}
