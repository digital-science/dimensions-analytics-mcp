/**
 * Unified configuration loader for Dimensions DSL settings.
 * Reads `.dimensions.config.json` with cwd → home fallback and env var override.
 * @module core/config/unified-loader
 */

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { z } from "zod";

const CONFIG_FILE_NAME = ".dimensions.config.json";

/**
 * Schema for the Dimensions config file.
 */
export const DimensionsConfigFileSchema = z.object({
  dsl: z
    .object({
      apiKey: z.string().optional(),
      baseUrl: z.string().optional(),
    })
    .optional(),
});

/** Full config file type */
export type DimensionsConfigFile = z.infer<typeof DimensionsConfigFileSchema>;

/**
 * Options for `loadDimensionsConfig`. All fields are optional overrides
 * intended for tests; production callers should omit `options` entirely.
 */
export interface LoadDimensionsConfigOptions {
  /** @internal Override cwd for tests; defaults to `process.cwd()`. */
  cwd?: string;
  /** @internal Override home directory for tests; defaults to `os.homedir()`. */
  homedir?: string;
}

/**
 * Loads and parses the Dimensions config file, checking cwd then home directory.
 * @param options - Optional cwd/homedir overrides (test-only)
 * @returns Parsed config file, or undefined if no file found
 */
export async function loadDimensionsConfig(
  options: LoadDimensionsConfigOptions = {},
): Promise<DimensionsConfigFile | undefined> {
  const { cwd = process.cwd(), homedir = os.homedir() } = options;

  const cwdPath = path.join(cwd, CONFIG_FILE_NAME);
  const cwdConfig = await readConfigFile(cwdPath);
  if (cwdConfig) {
    return cwdConfig;
  }

  const homePath = path.join(homedir, CONFIG_FILE_NAME);
  const homeConfig = await readConfigFile(homePath);
  if (homeConfig) {
    return homeConfig;
  }

  return undefined;
}

/**
 * Loads a specific service section from the config file with env var fallback.
 * @param section - Config file section key (e.g., "dsl")
 * @param envVars - Mapping from config field names to environment variable names
 * @returns Merged service config, or undefined if nothing found
 */
export async function loadServiceConfig<K extends keyof DimensionsConfigFile>(
  section: K,
  envVars?: Record<string, string>,
  options: LoadDimensionsConfigOptions = {},
): Promise<DimensionsConfigFile[K] | undefined> {
  const fileConfig = await loadDimensionsConfig(options);
  const sectionConfig = fileConfig?.[section] as Record<string, unknown> | undefined;

  let merged: Record<string, unknown> | undefined = sectionConfig
    ? { ...sectionConfig }
    : undefined;

  if (envVars) {
    for (const [field, envVar] of Object.entries(envVars)) {
      const value = process.env[envVar];
      if (value) {
        if (!merged) {
          merged = {};
        }
        merged[field] = value;
      }
    }
  }

  return merged as DimensionsConfigFile[K] | undefined;
}

/**
 * Reads and parses a config file at the given path.
 * @param filePath - Absolute path to the config file
 * @returns Parsed config, or undefined if file not found or invalid
 */
async function readConfigFile(filePath: string): Promise<DimensionsConfigFile | undefined> {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(content);
    return DimensionsConfigFileSchema.parse(parsed);
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      return undefined;
    }
    return undefined;
  }
}
