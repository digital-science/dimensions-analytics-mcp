/**
 * Command for extracting concepts from text using the Dimensions API.
 * @module commands/functions/ExtractConceptsCommand
 */

import { z } from "zod";
import { Command, ValidationError } from "../../../client/index.js";
import type {
  ExtractConceptsInput,
  ExtractConceptsResponse,
} from "../../types/special-functions.js";
import { escapeDslString } from "../../utils/escape.js";
import { validateInput } from "../validate-input.js";

/**
 * Zod schema for ExtractConceptsCommand input validation.
 */
export const ExtractConceptsInputSchema = z.object({
  /** Text to extract concepts from */
  text: z.string().min(1, "Text must not be empty").describe("Text to extract concepts from"),
  /** Whether to include relevance scores in the response */
  returnScores: z
    .boolean()
    .optional()
    .default(false)
    .describe("Include relevance scores for concepts"),
});

/**
 * Input type for ExtractConceptsCommand (raw input).
 */
export type ExtractConceptsCommandInput = z.input<typeof ExtractConceptsInputSchema>;

/**
 * Parsed input type for ExtractConceptsCommand (after validation with defaults).
 */
export type ExtractConceptsCommandParsedInput = z.output<typeof ExtractConceptsInputSchema>;

/**
 * Zod schema for validating API response with concept strings.
 */
const ConceptsSimpleResponseSchema = z.object({
  extracted_concepts: z.array(z.string()),
});

/**
 * Zod schema for validating API response with concept objects.
 */
const ConceptsWithScoresResponseSchema = z.object({
  extracted_concepts: z.array(
    z.object({
      concept: z.string(),
      relevance: z.number(),
    }),
  ),
});

/**
 * Command for extracting concepts from text using the Dimensions API.
 *
 * @template WithScores - Whether relevance scores are included
 *
 * @example
 * ```typescript
 * // Simple extraction
 * const cmd = new ExtractConceptsCommand({
 *   text: "Machine learning algorithms for drug discovery"
 * });
 * const result = await client.send(cmd);
 * console.log(result.extracted_concepts); // string[]
 *
 * // With scores
 * const cmdScores = new ExtractConceptsCommand({
 *   text: "Machine learning algorithms for drug discovery",
 *   returnScores: true
 * });
 * const resultScores = await client.send(cmdScores);
 * console.log(resultScores.extracted_concepts); // { concept, relevance }[]
 * ```
 */
export class ExtractConceptsCommand<WithScores extends boolean = false> extends Command<
  ExtractConceptsCommandParsedInput,
  ExtractConceptsResponse<WithScores>
> {
  static readonly inputSchema = ExtractConceptsInputSchema;

  readonly input: ExtractConceptsCommandParsedInput;

  /**
   * Creates a new ExtractConceptsCommand.
   * @param input - Command input parameters
   * @throws {ValidationError} If input validation fails
   */
  constructor(input: ExtractConceptsInput & { returnScores?: WithScores }) {
    super();
    this.input = validateInput(ExtractConceptsInputSchema, input);
  }

  /**
   * Resolves the DSL query for this command.
   * @returns The constructed DSL query string
   */
  resolveQuery(): string {
    const escapedText = escapeDslString(this.input.text);

    if (this.input.returnScores) {
      return `extract_concepts("${escapedText}", return_scores=true)`;
    }
    return `extract_concepts("${escapedText}")`;
  }

  /**
   * Transforms raw API response to typed output.
   * @param response - Raw API response
   * @returns Typed extraction results
   * @throws {ValidationError} If response structure is invalid
   */
  transformResponse(response: unknown): ExtractConceptsResponse<WithScores> {
    if (this.input.returnScores) {
      const parseResult = ConceptsWithScoresResponseSchema.safeParse(response);

      if (!parseResult.success) {
        throw new ValidationError("Invalid API response structure", {
          zodErrors: parseResult.error.issues,
        });
      }

      return parseResult.data as unknown as ExtractConceptsResponse<WithScores>;
    } else {
      const parseResult = ConceptsSimpleResponseSchema.safeParse(response);

      if (!parseResult.success) {
        throw new ValidationError("Invalid API response structure", {
          zodErrors: parseResult.error.issues,
        });
      }

      return parseResult.data as unknown as ExtractConceptsResponse<WithScores>;
    }
  }
}
