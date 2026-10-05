/**
 * Disk cache helpers for describe schema responses.
 * @module schema/cache
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { extractDescribeSchema } from "./extract.js";
import type { DescribeSchemaResponse } from "./types.js";

/** Default cache TTL: 24 hours. */
export const DEFAULT_SCHEMA_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/** On-disk cache envelope with metadata. */
export type SchemaCacheEnvelope = {
  readonly cachedAt: string;
  readonly version?: string;
  readonly schema: DescribeSchemaResponse;
};

/** Parsed cache entry with normalized timestamps. */
export type SchemaCacheEntry = {
  readonly response: DescribeSchemaResponse;
  readonly cachedAt: Date | undefined;
  readonly version: string | undefined;
};

/**
 * Returns whether a cache entry is within the configured TTL.
 * @param cachedAt - When the cache was written
 * @param ttlMs - Maximum cache age in milliseconds
 * @returns True when the entry is still fresh
 */
export function isCacheFresh(cachedAt: Date | undefined, ttlMs: number): boolean {
  if (cachedAt == null || !Number.isFinite(ttlMs) || ttlMs <= 0) {
    return false;
  }
  return Date.now() - cachedAt.getTime() < ttlMs;
}

/**
 * Reads a schema cache file (envelope format).
 * @param cachePath - Path to JSON cache file
 * @returns Parsed cache entry or undefined when missing/invalid
 */
export async function readSchemaCacheFile(
  cachePath: string,
): Promise<SchemaCacheEntry | undefined> {
  try {
    const text = await readFile(cachePath, "utf8");
    const parsed = JSON.parse(text) as unknown;
    return parseCachePayload(parsed);
  } catch {
    return undefined;
  }
}

/**
 * Parses cache JSON envelope format.
 * @param parsed - Parsed JSON value
 * @returns Normalized cache entry
 */
export function parseCachePayload(parsed: unknown): SchemaCacheEntry | undefined {
  if (typeof parsed !== "object" || parsed == null) {
    return undefined;
  }

  const record = parsed as Record<string, unknown>;

  if (!("schema" in record)) {
    return undefined;
  }

  try {
    const response = extractDescribeSchema(record.schema);
    const cachedAt = typeof record.cachedAt === "string" ? new Date(record.cachedAt) : undefined;
    const version = typeof record.version === "string" ? record.version : undefined;
    return { response, cachedAt, version };
  } catch {
    return undefined;
  }
}

/**
 * Writes describe schema to a cache file with metadata envelope.
 * @param cachePath - Path to JSON cache file
 * @param response - Schema response to persist
 * @param version - Optional DSL version
 */
export async function writeSchemaCacheFile(
  cachePath: string,
  response: DescribeSchemaResponse,
  version?: string,
): Promise<void> {
  const envelope: SchemaCacheEnvelope = {
    cachedAt: new Date().toISOString(),
    ...(version != null ? { version } : {}),
    schema: response,
  };
  await mkdir(dirname(cachePath), { recursive: true });
  await writeFile(cachePath, JSON.stringify(envelope), "utf8");
}

/**
 * Resolves cache TTL from options or environment.
 * @param overrideMs - Explicit TTL from caller
 * @returns TTL in milliseconds
 */
export function resolveCacheTtlMs(overrideMs?: number): number {
  if (overrideMs != null && Number.isFinite(overrideMs) && overrideMs > 0) {
    return overrideMs;
  }
  const raw = process.env.SCHEMA_CACHE_TTL_MS;
  if (raw != null && raw.trim() !== "") {
    const value = Number.parseInt(raw, 10);
    if (Number.isFinite(value) && value > 0) {
      return value;
    }
  }
  return DEFAULT_SCHEMA_CACHE_TTL_MS;
}

/**
 * Default per-user schema cache file for local stdio servers.
 *
 * Keyed by instance host because entitlements, and therefore `describe schema`,
 * can differ between instances (app, trial, eu, custom).
 * @param baseUrl - Instance origin, e.g. `https://trial.dimensions.ai`
 * @returns Absolute cache file path in the OS user cache directory
 */
export function defaultSchemaCachePath(baseUrl: string): string {
  const host = new URL(baseUrl).host.replace(/[^a-z0-9.-]/gi, "_");
  return join(userCacheDir(), "dimensions-analytics-mcp", `schema-${host}.json`);
}

function userCacheDir(): string {
  if (process.platform === "darwin") return join(homedir(), "Library", "Caches");
  if (process.platform === "win32") {
    return process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local");
  }
  return process.env.XDG_CACHE_HOME || join(homedir(), ".cache");
}
