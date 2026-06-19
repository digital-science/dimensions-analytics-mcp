/**
 * JWT structure validation for Dimensions auth responses.
 * @module client/auth/jwt-utils
 */

import { AuthenticationError } from "../errors.js";

const JWT_SEGMENT = /^[A-Za-z0-9_-]+$/;

/**
 * Validates a JWT has three base64url segments.
 * @param token - Raw token from auth response
 * @returns The token string
 * @throws {AuthenticationError} When structure is invalid
 */
export function validateJwtStructure(token: unknown): string {
  if (typeof token !== "string") {
    throw new AuthenticationError("Invalid token: expected string");
  }
  const parts = token.split(".");
  if (parts.length !== 3 || parts.some((part) => !part || !JWT_SEGMENT.test(part))) {
    throw new AuthenticationError("Invalid JWT structure");
  }
  return token;
}

/**
 * Decodes the JWT payload (middle segment) without signature verification.
 * Use only for tokens returned by a trusted auth.json endpoint.
 */
export function decodeJwtPayload(token: string): Record<string, unknown> {
  const validated = validateJwtStructure(token);
  const payloadSegment = validated.split(".")[1];
  const json = Buffer.from(payloadSegment, "base64url").toString("utf8");
  return JSON.parse(json) as Record<string, unknown>;
}
