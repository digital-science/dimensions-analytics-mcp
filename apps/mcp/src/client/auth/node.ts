/**
 * Node.js-only auth config loaders.
 *
 * These utilities read credentials from the filesystem and environment variables.
 * They depend on `node:fs` and must not be imported in browser/edge contexts.
 *
 * @example
 * ```typescript
 * import { fromEnv, fromPath } from "./node.js";
 * ```
 *
 * @module core/auth/node
 */

export type { FromEnvOptions } from "./config-loaders.js";
export { fromEnv, fromObject, fromPath } from "./config-loaders.js";
