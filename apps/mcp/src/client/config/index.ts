/**
 * Configuration schemas and loaders.
 * @module core/config
 */

export { loadConfig, loadConfigFile } from "./loader.js";
export type { DslConfig } from "./schemas.js";
export { DslConfigSchema, RawConfigFileSchema } from "./schemas.js";
export type { ConfigLoaderOptions, ConfigResult, RawConfigFile } from "./types.js";
export type { DimensionsConfigFile, LoadDimensionsConfigOptions } from "./unified-loader.js";
export {
  DimensionsConfigFileSchema,
  loadDimensionsConfig,
  loadServiceConfig,
} from "./unified-loader.js";
