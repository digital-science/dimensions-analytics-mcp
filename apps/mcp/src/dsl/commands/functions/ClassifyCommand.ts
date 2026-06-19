/**
 * Command for classifying text using Dimensions classification systems.
 * @module commands/functions/ClassifyCommand
 */

import { z } from "zod";
import { Command, ValidationError } from "../../../client/index.js";
import {
  CLASSIFICATION_SYSTEMS,
  type ClassificationSystem,
  type ClassifyInput,
  type ClassifyResponse,
} from "../../types/special-functions.js";
import { escapeDslString } from "../../utils/escape.js";
import { validateInput } from "../validate-input.js";

/**
 * Zod schema for ClassifyCommand input validation.
 */
export const ClassifyInputSchema = z
  .object({
    /** Document title (at least title or abstract must be provided) */
    title: z.string().optional().describe("Document title for classification"),
    /** Document abstract (at least title or abstract must be provided) */
    abstract: z.string().optional().describe("Document abstract for classification"),
    /** Classification system to use */
    system: z.enum(CLASSIFICATION_SYSTEMS).describe("Classification system to use"),
  })
  .refine((data) => data.title || data.abstract, {
    message: "At least one of title or abstract must be provided",
    path: ["title", "abstract"],
  });

/**
 * Input type for ClassifyCommand (raw input).
 */
export type ClassifyCommandInput = z.input<typeof ClassifyInputSchema>;

/**
 * Parsed input type for ClassifyCommand (after validation).
 */
export type ClassifyCommandParsedInput = z.output<typeof ClassifyInputSchema>;

/**
 * Zod schema for validating API response structure.
 */
const ClassifyApiResponseSchema = z.record(
  z.string(),
  z.array(
    z.object({
      id: z.string(),
      name: z.string(),
    }),
  ),
);

/**
 * Command for classifying text using Dimensions classification systems.
 * Supports FOR, SDG, RCDC, and other research classification taxonomies.
 *
 * @template S - The classification system type
 *
 * @example
 * ```typescript
 * const cmd = new ClassifyCommand({
 *   title: "Burnout and intentions to quit the nursing profession",
 *   abstract: "BACKGROUND: Burnout is an occupational disease...",
 *   system: "FOR"
 * });
 *
 * const result = await client.send(cmd);
 * console.log(result.FOR); // Array of classification entries
 * ```
 */
export class ClassifyCommand<S extends ClassificationSystem = ClassificationSystem> extends Command<
  ClassifyCommandParsedInput,
  ClassifyResponse<S>
> {
  static readonly inputSchema = ClassifyInputSchema;

  readonly input: ClassifyCommandParsedInput;

  /**
   * Creates a new ClassifyCommand.
   * @param input - Command input parameters
   * @throws {ValidationError} If input validation fails
   */
  constructor(input: ClassifyInput & { system: S }) {
    super();
    this.input = validateInput(ClassifyInputSchema, input);
  }

  /**
   * Resolves the DSL query for this command.
   * @returns The constructed DSL query string
   */
  resolveQuery(): string {
    const parts: string[] = [];

    if (this.input.title) {
      parts.push(`title="${escapeDslString(this.input.title)}"`);
    }
    if (this.input.abstract) {
      parts.push(`abstract="${escapeDslString(this.input.abstract)}"`);
    }
    parts.push(`system="${this.input.system}"`);

    return `classify(${parts.join(", ")})`;
  }

  /**
   * Transforms raw API response to typed output.
   * @param response - Raw API response
   * @returns Typed classification results
   * @throws {ValidationError} If response structure is invalid
   */
  transformResponse(response: unknown): ClassifyResponse<S> {
    const parseResult = ClassifyApiResponseSchema.safeParse(response);

    if (!parseResult.success) {
      throw new ValidationError("Invalid API response structure", {
        zodErrors: parseResult.error.issues,
      });
    }

    // Return the response with the correct system key
    return parseResult.data as unknown as ClassifyResponse<S>;
  }
}
