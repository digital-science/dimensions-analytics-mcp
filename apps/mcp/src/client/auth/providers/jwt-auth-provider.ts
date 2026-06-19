/**
 * JWT authentication provider for Dimensions API.
 * @module core/auth/providers/jwt-auth-provider
 */

import { AuthenticationError, NetworkError, sanitizeErrorMessage } from "../../errors.js";
import { validateJwtStructure } from "../jwt-utils.js";
import { AuthResponseSchema } from "../schemas.js";
import type { AuthProvider, JwtAuthConfig } from "../types.js";

/** Default auth endpoint URL */
const DEFAULT_AUTH_URL = "https://app.dimensions.ai/api/auth.json";

/** Default request timeout in milliseconds */
const DEFAULT_TIMEOUT = 30000;

/**
 * Authentication provider using JWT tokens from Dimensions API.
 * Exchanges an API key for a short-lived JWT token.
 *
 * Note: This provider does NOT cache tokens internally. Use the withCaching()
 * decorator if caching is needed.
 *
 * @example
 * ```typescript
 * import { JwtAuthProvider } from "../../index.js";
 * import { withCaching } from "../../index.js";
 *
 * const provider = new JwtAuthProvider({
 *   type: 'jwt',
 *   apiKey: 'your-api-key'
 * });
 *
 * // Wrap with caching for production use
 * const cachedProvider = withCaching(provider, {
 *   cacheDurationMs: 3600000 // 1 hour
 * });
 *
 * const headers = await cachedProvider.getHeaders();
 * // { Authorization: 'JWT eyJ...' }
 * ```
 */
export class JwtAuthProvider implements AuthProvider {
  readonly type = "jwt" as const;

  private readonly apiKey: string;
  private readonly authUrl: string;
  private readonly timeout: number;

  private currentToken: string | null = null;
  private initialized = false;

  /**
   * Creates a new JwtAuthProvider.
   * @param config - JWT auth configuration
   */
  constructor(config: JwtAuthConfig) {
    this.apiKey = config.apiKey;
    this.authUrl = config.authUrl ?? DEFAULT_AUTH_URL;
    this.timeout = config.timeout ?? DEFAULT_TIMEOUT;
  }

  /**
   * Initialize the provider by fetching an initial token.
   * Called automatically on first getHeaders() if not called explicitly.
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }
    await this.fetchToken();
    this.initialized = true;
  }

  /**
   * Get the Authorization header with JWT token.
   * Fetches a new token if not initialized.
   * @returns Headers object with Authorization header
   */
  async getHeaders(): Promise<Record<string, string>> {
    if (!this.currentToken) {
      await this.fetchToken();
    }
    return {
      Authorization: `JWT ${this.currentToken}`,
    };
  }

  /**
   * Force refresh of the JWT token by fetching a new one.
   */
  async refresh(): Promise<void> {
    await this.fetchToken();
  }

  /**
   * Invalidate the current token, forcing a refresh on next getHeaders().
   */
  invalidate(): void {
    this.currentToken = null;
    this.initialized = false;
  }

  /**
   * Fetches a new JWT token from the auth endpoint.
   * @throws {AuthenticationError} If authentication fails
   * @throws {NetworkError} If a network error occurs
   */
  private async fetchToken(): Promise<void> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(this.authUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ key: this.apiKey }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new AuthenticationError(
          `Authentication failed: ${response.status} ${response.statusText}`,
        );
      }

      const rawData: unknown = await response.json();
      const parseResult = AuthResponseSchema.safeParse(rawData);

      if (!parseResult.success) {
        throw new AuthenticationError(
          `Invalid authentication response: ${parseResult.error.message}`,
        );
      }

      // Schema guarantees at least one non-empty token field
      const rawToken = parseResult.data.token || parseResult.data.access_token;
      this.currentToken = validateJwtStructure(rawToken);
    } catch (error) {
      if (error instanceof AuthenticationError) {
        throw error;
      }
      if (error instanceof Error && error.name === "AbortError") {
        throw new NetworkError("Authentication request timeout");
      }
      throw new NetworkError(`Authentication failed: ${sanitizeErrorMessage(error)}`);
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
