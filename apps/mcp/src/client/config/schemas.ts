/**
 * Zod schemas for config validation.
 * @module core/config/schemas
 */

import { z } from "zod";

/**
 * Schema for DSL service configuration.
 */
export const DslConfigSchema = z.object({
  apiKey: z.string().min(1, "API key is required"),
  baseUrl: z.string().url().optional().default("https://app.dimensions.ai"),
});

/**
 * Schema for the raw config file structure.
 */
export const RawConfigFileSchema = z.object({
  dsl: z
    .object({
      apiKey: z.string().optional(),
      baseUrl: z.string().optional(),
    })
    .optional(),
});

export type DslConfig = z.infer<typeof DslConfigSchema>;
