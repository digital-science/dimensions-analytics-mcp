/**
 * Shared input validation helper for command constructors.
 * Reduces boilerplate across all Command subclasses.
 * @module commands/validate-input
 */

import type { z } from "zod";
import { ValidationError } from "../../client/index.js";

/**
 * Validates input against a Zod schema, returning the parsed result.
 * Throws a {@link ValidationError} with the first Zod issue message on failure.
 *
 * @template T - The Zod schema type
 * @param schema - Zod schema to validate against
 * @param input - Raw input to validate
 * @returns The parsed and validated input
 * @throws {ValidationError} If validation fails
 */
export function validateInput<T extends z.ZodTypeAny>(schema: T, input: unknown): z.output<T> {
  const result = schema.safeParse(input);
  if (!result.success) {
    const firstError = result.error.issues[0];
    throw new ValidationError(firstError?.message ?? "Validation failed", {
      zodErrors: result.error.issues,
    });
  }
  return result.data;
}
