/**
 * Configuration file loader with environment variable support.
 * @module core/config/loader
 */

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import type { z } from "zod";
import { ValidationError } from "../errors.js";
import { RawConfigFileSchema } from "./schemas.js";
import type { ConfigLoaderOptions, ConfigResult, RawConfigFile } from "./types.js";

const CONFIG_FILE_NAME = ".dimensions.config.json";

/**
 * Environment variable mapping for each service.
 */
const ENV_VAR_MAP: Record<string, Record<string, string>> = {
  dsl: {
    apiKey: "DIMENSIONS_DSL_API_KEY",
    baseUrl: "DIMENSIONS_DSL_BASE_URL",
  },
};

/**
 * Loads and parses a JSON config file.
 * @param filePath - Path to the config file
 * @returns Parsed config object, or undefined if file not found
 * @throws Error if file exists but cannot be parsed
 */
export async function loadConfigFile(filePath: string): Promise<RawConfigFile | undefined> {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(content);
    return RawConfigFileSchema.parse(parsed);
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      return undefined;
    }
    throw error;
  }
}

/**
 * Loads config from environment variables for a service.
 * @param service - Service name
 * @returns Config object from env vars, or undefined if not set
 */
function loadFromEnv(service: string): Record<string, string> | undefined {
  const mapping = ENV_VAR_MAP[service];
  if (!mapping) {
    return undefined;
  }

  const config: Record<string, string> = {};
  let hasAnyValue = false;

  for (const [key, envVar] of Object.entries(mapping)) {
    const value = process.env[envVar];
    if (value) {
      config[key] = value;
      hasAnyValue = true;
    }
  }

  return hasAnyValue ? config : undefined;
}

/**
 * Loads configuration with priority:
 * 1. Explicit configPath
 * 2. Environment variables (DIMENSIONS_{SERVICE}_{KEY})
 * 3. .dimensions.config.json in cwd
 * 4. .dimensions.config.json in home directory
 *
 * @param options - Loader options (service is required to extract config from file)
 * @param schema - Zod schema for validation
 * @returns Config result with source, or undefined if not found or service not specified
 * @throws ValidationError if config fails schema validation
 */
export async function loadConfig<T>(
  options: ConfigLoaderOptions,
  schema: z.ZodSchema<T>,
): Promise<ConfigResult<T> | undefined> {
  const { configPath, service, cwd = process.cwd(), homedir = os.homedir() } = options;

  if (configPath) {
    const rawConfig = await loadConfigFile(configPath);
    if (rawConfig && service) {
      const serviceConfig = rawConfig[service as keyof RawConfigFile];
      if (serviceConfig) {
        return validateAndReturn(serviceConfig, schema, "explicit");
      }
    }
    return undefined;
  }

  if (service) {
    const envConfig = loadFromEnv(service);
    if (envConfig) {
      const result = schema.safeParse(envConfig);
      if (result.success) {
        return { config: result.data, source: "env" };
      }
    }
  }

  const cwdConfigPath = path.join(cwd, CONFIG_FILE_NAME);
  const cwdConfig = await loadConfigFile(cwdConfigPath);
  if (cwdConfig && service) {
    const serviceConfig = cwdConfig[service as keyof RawConfigFile];
    if (serviceConfig) {
      return validateAndReturn(serviceConfig, schema, "cwd");
    }
  }

  const homeConfigPath = path.join(homedir, CONFIG_FILE_NAME);
  const homeConfig = await loadConfigFile(homeConfigPath);
  if (homeConfig && service) {
    const serviceConfig = homeConfig[service as keyof RawConfigFile];
    if (serviceConfig) {
      return validateAndReturn(serviceConfig, schema, "home");
    }
  }

  return undefined;
}

/**
 * Validates config against schema and returns result.
 * @param config - Raw config object
 * @param schema - Zod schema
 * @param source - Config source
 * @returns Validated config result
 * @throws ValidationError if validation fails
 */
function validateAndReturn<T>(
  config: unknown,
  schema: z.ZodSchema<T>,
  source: ConfigResult<T>["source"],
): ConfigResult<T> {
  const result = schema.safeParse(config);
  if (!result.success) {
    throw new ValidationError(
      `Configuration validation failed (source: ${source}): ${result.error.message}`,
      { issues: result.error.issues, source },
    );
  }
  return { config: result.data, source };
}
