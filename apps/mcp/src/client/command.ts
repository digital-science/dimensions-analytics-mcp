import type { z } from "zod";

/**
 * Base class for all Dimensions API commands.
 *
 * Commands are self-contained units with:
 * - Input schema (Zod) for validation
 * - Typed input and output
 * - Execution handled by DimensionsClient.send()
 */
export abstract class Command<TInput, TOutput> {
  /**
   * Zod schema for input validation.
   * Must be defined on subclass.
   */
  static readonly inputSchema: z.ZodType<unknown>;

  /**
   * Validated input parameters.
   */
  abstract readonly input: TInput;

  /**
   * Resolves the DSL query for this command.
   * Override in subclasses that use DSL queries.
   */
  resolveQuery?(): string;

  /**
   * Resolves the API endpoint for this command.
   * Default is DSL endpoint; override for special endpoints.
   */
  resolveEndpoint(): string {
    return "/api/dsl/v2";
  }

  /**
   * Transforms raw API response to typed output.
   * Override in subclasses.
   */
  transformResponse?(response: unknown): TOutput;
}

/**
 * Type helper to extract input type from a Command class.
 */
export type CommandInput<T extends Command<unknown, unknown>> =
  T extends Command<infer I, unknown> ? I : never;

/**
 * Type helper to extract output type from a Command class.
 */
export type CommandOutput<T extends Command<unknown, unknown>> =
  T extends Command<unknown, infer O> ? O : never;
