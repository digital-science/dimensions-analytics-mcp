/**
 * Configuration schema and types for DimensionsClient.
 * @module config
 */

import { z } from "zod";
import { InternalDslEnvSchema } from "./deployment-config.js";

const InternalClientConfigSchema = z.object({
  service: InternalDslEnvSchema,
  userEmail: z.string().min(1),
  clientIp: z.string().optional(),
});

const SharedClientConfigSchema = z.object({
  /** Base URL for Dimensions API (public backend only) */
  baseUrl: z.string().url().default("https://app.dimensions.ai"),
  /** Request timeout in milliseconds */
  timeout: z.number().positive().default(30000),
  /** Maximum number of retry attempts */
  maxRetries: z.number().nonnegative().default(3),
  /** Delay between retries in milliseconds */
  retryDelay: z.number().positive().default(1000),
  /** Maximum requests per minute (public backend client-side limiter) */
  rateLimitPerMinute: z.number().positive().default(30),
  /** Validate DSL queries before sending. Default: true */
  validateQueries: z.boolean().default(false),
});

const PublicClientConfigSchema = SharedClientConfigSchema.extend({
  backend: z.literal("public").default("public"),
  apiKey: z.string().min(1),
});

const InternalBackendConfigSchema = SharedClientConfigSchema.extend({
  backend: z.literal("internal"),
  internal: InternalClientConfigSchema,
});

/**
 * Zod schema for DimensionsClient configuration.
 * Validates and provides defaults for all configuration options.
 */
export const DimensionsClientConfigSchema = z.union([
  InternalBackendConfigSchema,
  PublicClientConfigSchema,
]);

/**
 * Configuration options for DimensionsClient.
 */
export type DimensionsClientConfig = z.input<typeof DimensionsClientConfigSchema>;

/**
 * Validated configuration with defaults applied.
 */
export type ResolvedDimensionsClientConfig = z.output<typeof DimensionsClientConfigSchema>;
