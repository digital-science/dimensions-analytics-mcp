/**
 * Node.js-only configuration file loaders.
 *
 * These utilities read `.dimensions.config.json` from disk and merge with
 * environment variables. They depend on `node:fs/promises` and must not be
 * imported in browser/edge contexts.
 *
 * @example
 * ```typescript
 * import { loadDimensionsConfig, loadServiceConfig } from "./node.js";
 * ```
 *
 * @module core/config/node
 */

export { loadConfig, loadConfigFile } from "./loader.js";
export type { DimensionsConfigFile } from "./unified-loader.js";
export {
  DimensionsConfigFileSchema,
  loadDimensionsConfig,
  loadServiceConfig,
} from "./unified-loader.js";
