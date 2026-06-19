/**
 * Authentication provider types for Dimensions API key → JWT exchange.
 * @module client/auth/types
 */

/** Base interface for authentication providers. */
export interface AuthProvider {
  readonly type: AuthConfig["type"];
  initialize(): Promise<void>;
  getHeaders(): Promise<Record<string, string>>;
  refresh(): Promise<void>;
  invalidate(): void;
}

/** JWT auth configuration (Dimensions API key). */
export type AuthConfig = JwtAuthConfig;

/** Configuration for JWT-based authentication with Dimensions API. */
export interface JwtAuthConfig {
  readonly type: "jwt";
  readonly apiKey: string;
  readonly authUrl?: string;
  readonly tokenCacheDuration?: number;
  readonly timeout?: number;
}

/** Type guard for JWT auth configuration. */
export function isJwtAuthConfig(config: AuthConfig): config is JwtAuthConfig {
  return config.type === "jwt";
}
