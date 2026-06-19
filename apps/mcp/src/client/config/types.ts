/**
 * Configuration loader types.
 * @module core/config/types
 */

/**
 * Options for loading configuration.
 */
export interface ConfigLoaderOptions {
  /** Explicit path to config file */
  configPath?: string;
  /** Service to load config for (e.g., 'dsl') */
  service?: string;
  /** @internal Override cwd for tests; defaults to `process.cwd()`. */
  cwd?: string;
  /** @internal Override home directory for tests; defaults to `os.homedir()`. */
  homedir?: string;
}

/**
 * Result of loading configuration.
 */
export interface ConfigResult<T> {
  /** Loaded configuration */
  readonly config: T;
  /** Source of the configuration */
  readonly source: "explicit" | "env" | "cwd" | "home";
}

/**
 * Raw config file structure with nested service configs.
 */
export interface RawConfigFile {
  /** DSL service configuration */
  readonly dsl?: {
    readonly apiKey?: string;
    readonly baseUrl?: string;
  };
}
