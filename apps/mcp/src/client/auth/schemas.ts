/**
 * Zod schemas for JWT authentication configuration.
 * @module client/auth/schemas
 */

import { z } from "zod";

/** Zod schema for JWT auth configuration. */
export const JwtAuthConfigSchema = z.object({
  type: z.literal("jwt"),
  apiKey: z.string().min(1, "API key is required"),
  authUrl: z.string().url().optional(),
  tokenCacheDuration: z.number().positive().optional(),
  timeout: z.number().positive().optional(),
});

/** Zod schema for authentication API response. */
export const AuthResponseSchema = z
  .object({
    token: z.string().min(1, "token must be a non-empty string").optional(),
    access_token: z.string().min(1, "access_token must be a non-empty string").optional(),
  })
  .refine((data) => data.token || data.access_token, {
    message: "Either 'token' or 'access_token' field is required with a non-empty value",
  });
