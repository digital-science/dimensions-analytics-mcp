/**
 * Shared Zod schemas for facet and aggregate commands.
 * @module commands/facet/schemas
 */

import { z } from "zod";
import { ValidationError } from "../../../client/index.js";
import { VALID_ENTITIES } from "../../types/vocabulary.js";

/**
 * Zod schema for the entity type field, derived from the core VALID_ENTITIES constant.
 */
export const EntitySchema = z.enum(VALID_ENTITIES as unknown as [string, ...string[]]);

/**
 * Schema for where clause filters used in facet/aggregate commands.
 * Supports basic comparison operators for field-level filtering.
 */
export const WhereFilterSchema = z.object({
  /** Field name to filter on */
  field: z.string().min(1),
  /** Comparison operator */
  operator: z.enum(["=", "!=", ">", "<", ">=", "<="]),
  /** Value to compare against */
  value: z.union([z.string(), z.number(), z.boolean()]),
});

/**
 * Input type for a where clause filter.
 */
export type WhereFilterInput = z.infer<typeof WhereFilterSchema>;

/**
 * Schema for scalar comparison filters (=, !=, >, <, >=, <=).
 */
const ScalarFilterSchema = z.object({
  /** Field name to filter on */
  field: z.string().min(1),
  /** Scalar comparison operator */
  operator: z.enum(["=", "!=", ">", "<", ">=", "<="]),
  /** Value to compare against */
  value: z.union([z.string(), z.number(), z.boolean()]),
});

/**
 * Schema for set membership filters (in).
 */
const InFilterSchema = z.object({
  /** Field name to filter on */
  field: z.string().min(1),
  /** Set membership operator */
  operator: z.literal("in"),
  /** Values to match against (scalar is coerced to single-element array) */
  value: z.union([
    z.string().transform((v) => [v]),
    z.number().transform((v) => [v]),
    z.array(z.string()).min(1),
    z.array(z.number()).min(1),
  ]),
});

/**
 * Schema for emptiness check filters (is_empty, is_not_empty).
 */
const EmptinessFilterSchema = z.object({
  /** Field name to filter on */
  field: z.string().min(1),
  /** Emptiness check operator */
  operator: z.enum(["is_empty", "is_not_empty"]),
});

/**
 * Extended where filter schema supporting all DSL filter operators.
 * Covers scalar comparisons, set membership (in), and emptiness checks (is_empty/is_not_empty).
 *
 * Uses a discriminated union on `operator` for precise type narrowing.
 */
export const ExtendedWhereFilterSchema = z.discriminatedUnion("operator", [
  ScalarFilterSchema,
  InFilterSchema,
  EmptinessFilterSchema.extend({ operator: z.literal("is_empty") }),
  EmptinessFilterSchema.extend({ operator: z.literal("is_not_empty") }),
]);

/**
 * Input type for an extended where filter (supports in/is_empty/is_not_empty).
 */
export type ExtendedWhereFilterInput = z.infer<typeof ExtendedWhereFilterSchema>;

/**
 * Validates that a raw API response is a non-null object.
 * @param response - The raw API response
 * @returns The response as a record
 * @throws {ValidationError} If response is not a non-null object
 */
export function assertObjectResponse(response: unknown): Record<string, unknown> {
  if (response == null || typeof response !== "object" || Array.isArray(response)) {
    throw new ValidationError("Expected object response from API");
  }
  return response as Record<string, unknown>;
}
