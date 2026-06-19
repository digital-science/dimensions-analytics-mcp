/**
 * HTTP client, authentication, and shared infrastructure for the Dimensions API.
 * @module client
 */

export type { CachingOptions } from "./auth/decorators/index.js";
export { withCaching } from "./auth/decorators/index.js";
export { createAuthProvider } from "./auth/factory.js";
export { JwtAuthProvider } from "./auth/providers/jwt-auth-provider.js";
export { AuthResponseSchema } from "./auth/schemas.js";
export type { AuthConfig, AuthProvider, JwtAuthConfig } from "./auth/types.js";
export type { CommandInput, CommandOutput } from "./command.js";
export { Command } from "./command.js";
export type {
  ConfigLoaderOptions,
  ConfigResult,
  DslConfig,
  RawConfigFile,
} from "./config/index.js";
export { DslConfigSchema, RawConfigFileSchema } from "./config/index.js";
export type { DimensionsClientConfig, ResolvedDimensionsClientConfig } from "./config.js";
export { DimensionsClientConfigSchema } from "./config.js";
export type {
  AppDeploymentConfig,
  DeploymentMode,
  HostedEnvConfig,
  InternalDslEnvConfig,
} from "./deployment-config.js";
export {
  hostedBootstrapUser,
  InternalDslEnvSchema,
  loadDeploymentConfig,
} from "./deployment-config.js";
export type { ClientRateLimitInfo } from "./errors.js";
export {
  AuthenticationError,
  DimensionsError,
  isDimensionsError,
  isNotFoundError,
  isUnprocessableEntityError,
  NetworkError,
  NotFoundError,
  QuerySyntaxError,
  RateLimitError,
  ServerError,
  sanitizeErrorMessage,
  TimeoutError,
  UnprocessableEntityError,
  ValidationError,
} from "./errors.js";
export type {
  DimensionsResponse,
  GetOptions,
  HttpClientConfig,
  PostFormOptions,
  PostJsonOptions,
  RequestOptions,
} from "./http-client.js";
export { HttpClient } from "./http-client.js";
export { InternalDslClient } from "./internal-dsl-client.js";
export type { RateLimiterConfig } from "./rate-limiter.js";
export { RateLimiter } from "./rate-limiter.js";
export {
  JWT_API_KEY_SUB_PREFIX,
  parseBearerToken,
  resolveUserFromApiKey,
} from "./resolve-api-key-user.js";
export type { DslResponse, QueryExecutor, QueryExecutorOptions } from "./types.js";
