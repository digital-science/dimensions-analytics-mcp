/**
 * Configuration loaders for JWT AuthConfig.
 * @module client/auth/config-loaders
 */

import { readFileSync } from "node:fs";
import { ValidationError } from "../errors.js";
import { JwtAuthConfigSchema } from "./schemas.js";
import type { AuthConfig, JwtAuthConfig } from "./types.js";

/** Options for loading config from environment variables. */
export interface FromEnvOptions {
  /** Env prefix (default `DIMENSIONS` → `DIMENSIONS_API_KEY`) */
  prefix?: string;
}

/**
 * Load JWT auth config from environment variables.
 * @param type - Must be `"jwt"`
 * @param options - Optional env prefix
 * @returns Validated JwtAuthConfig
 */
export function fromEnv(type: "jwt", options?: FromEnvOptions): JwtAuthConfig {
  if (type !== "jwt") {
    throw new ValidationError("Only JWT auth is supported");
  }

  const envPrefix = options?.prefix ?? "DIMENSIONS";
  const apiKey = process.env[`${envPrefix}_API_KEY`];
  if (!apiKey) {
    throw new ValidationError(`Missing required environment variable: ${envPrefix}_API_KEY`);
  }

  const authUrl = process.env[`${envPrefix}_AUTH_URL`];
  const tokenCacheDuration = process.env[`${envPrefix}_TOKEN_CACHE_DURATION`];
  const timeout = process.env[`${envPrefix}_TIMEOUT`];

  return {
    type: "jwt",
    apiKey,
    ...(authUrl && { authUrl }),
    ...(tokenCacheDuration && {
      tokenCacheDuration: Number.parseInt(tokenCacheDuration, 10),
    }),
    ...(timeout && { timeout: Number.parseInt(timeout, 10) }),
  };
}

/** Load JWT auth config from a JSON file. */
export function fromPath(filePath: string): AuthConfig {
  let fileContent: string;
  try {
    fileContent = readFileSync(filePath, "utf-8");
  } catch (error) {
    throw new ValidationError(`Failed to read config file: ${filePath}`, {
      cause: error instanceof Error ? error.message : String(error),
    });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(fileContent);
  } catch (error) {
    throw new ValidationError(`Invalid JSON in config file: ${filePath}`, {
      cause: error instanceof Error ? error.message : String(error),
    });
  }

  return fromObject(parsed);
}

/** Validate and return JWT auth config from an object. */
export function fromObject(obj: unknown): AuthConfig {
  const parseResult = JwtAuthConfigSchema.safeParse(obj);
  if (!parseResult.success) {
    throw new ValidationError(`Invalid auth configuration: ${parseResult.error.message}`, {
      issues: parseResult.error.issues,
    });
  }
  return parseResult.data;
}
