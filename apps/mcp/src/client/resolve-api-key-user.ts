/**
 * Validates a Dimensions user API key via Radar auth.json and resolves user identity.
 * @module client/resolve-api-key-user
 */

import { decodeJwtPayload, validateJwtStructure } from "./auth/jwt-utils.js";
import { AuthResponseSchema } from "./auth/schemas.js";
import { AuthenticationError, NetworkError, sanitizeErrorMessage } from "./errors.js";

/** JWT `sub` prefix for internal API keys (not end-user keys). */
export const JWT_API_KEY_SUB_PREFIX = "JWT_API_KEY_";

export interface ResolveApiKeyUserOptions {
  readonly apiKey: string;
  readonly authUrl: string;
  readonly clientIp?: string;
  readonly timeout?: number;
}

/**
 * Exchanges a user API key for identity via POST /api/auth.json.
 * @returns User email (`sub` claim) for X-DIMENSIONS-USER
 * @throws {AuthenticationError} When the key is invalid or is an internal service key
 */
export async function resolveUserFromApiKey(options: ResolveApiKeyUserOptions): Promise<string> {
  const authUrl = options.authUrl.replace(/\/$/, "");
  const url = authUrl.endsWith("/api/auth.json") ? authUrl : `${authUrl}/api/auth.json`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options.timeout ?? 30_000);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (options.clientIp) {
    headers["X-Forwarded-For"] = options.clientIp;
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ key: options.apiKey }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new AuthenticationError("Invalid or revoked API key");
    }

    const rawData: unknown = await response.json();
    const parsed = AuthResponseSchema.safeParse(rawData);
    if (!parsed.success) {
      throw new AuthenticationError("Invalid authentication response");
    }

    const rawToken = parsed.data.token || parsed.data.access_token;
    const token = validateJwtStructure(rawToken);
    const payload = decodeJwtPayload(token);
    const sub = payload.sub;

    if (typeof sub !== "string" || sub.length === 0) {
      throw new AuthenticationError("Authentication response missing user identity");
    }

    if (sub.startsWith(JWT_API_KEY_SUB_PREFIX)) {
      throw new AuthenticationError("Internal API keys cannot be used with hosted MCP");
    }

    return sub;
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

/**
 * Parses `Authorization: Bearer <token>` from an HTTP header value.
 * @throws {AuthenticationError} When the header is missing or malformed
 */
export function parseBearerToken(authorizationHeader: string | undefined): string {
  if (!authorizationHeader?.trim()) {
    throw new AuthenticationError("Missing Authorization header");
  }

  const match = /^Bearer\s+(\S+)\s*$/i.exec(authorizationHeader);
  if (!match?.[1]) {
    throw new AuthenticationError("Authorization header must be Bearer <api-key>");
  }

  return match[1];
}
