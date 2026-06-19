/**
 * Factory function for creating JWT AuthProvider instances.
 * @module client/auth/factory
 */

import { ValidationError } from "../errors.js";
import { withCaching } from "./decorators/index.js";
import { JwtAuthProvider } from "./providers/jwt-auth-provider.js";
import { JwtAuthConfigSchema } from "./schemas.js";
import type { AuthProvider, JwtAuthConfig } from "./types.js";

/** Default token cache duration for JWT: 1 hour */
const DEFAULT_TOKEN_CACHE_DURATION_MS = 3600000;

/**
 * Creates a JWT AuthProvider with token caching.
 * @param config - JWT authentication configuration
 * @returns Configured AuthProvider instance
 * @throws {ValidationError} If the configuration is invalid
 */
export function createAuthProvider(config: JwtAuthConfig): AuthProvider {
  const parseResult = JwtAuthConfigSchema.safeParse(config);
  if (!parseResult.success) {
    throw new ValidationError(`Invalid auth configuration: ${parseResult.error.message}`, {
      issues: parseResult.error.issues,
    });
  }

  const validConfig = parseResult.data;
  const jwtProvider = new JwtAuthProvider(validConfig);
  const cacheDurationMs =
    (validConfig.tokenCacheDuration ?? 3600) * 1000 || DEFAULT_TOKEN_CACHE_DURATION_MS;
  return withCaching(jwtProvider, { cacheDurationMs });
}
