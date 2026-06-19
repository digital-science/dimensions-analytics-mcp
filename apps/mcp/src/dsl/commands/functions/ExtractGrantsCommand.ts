/**
 * Command for extracting/resolving grants using the Dimensions API.
 * @module commands/functions/ExtractGrantsCommand
 */

import { z } from "zod";
import { Command, ValidationError } from "../../../client/index.js";
import type { ExtractGrantsInput, ExtractGrantsResponse } from "../../types/special-functions.js";
import { escapeDslString } from "../../utils/escape.js";
import { validateInput } from "../validate-input.js";

/**
 * Zod schema for ExtractGrantsCommand input validation.
 */
export const ExtractGrantsInputSchema = z.object({
  grantNumber: z
    .string()
    .min(1, "Grant number must not be empty")
    .describe("Grant number to look up"),
  fundref: z.string().optional().describe("FundRef ID of the funder"),
  funderName: z.string().optional().describe("Funder name (alternative to fundref)"),
});

/**
 * Input type for ExtractGrantsCommand (raw input).
 */
export type ExtractGrantsCommandInput = z.input<typeof ExtractGrantsInputSchema>;

/**
 * Parsed input type for ExtractGrantsCommand (after validation).
 */
export type ExtractGrantsCommandParsedInput = z.output<typeof ExtractGrantsInputSchema>;

/**
 * Zod schema for validating API response structure.
 * The Dimensions API returns a single resolved grant ID, or null if not found.
 */
const ExtractGrantsResponseSchema = z.object({
  grant_id: z.string().nullable(),
});

/**
 * Command for extracting/resolving grants using the Dimensions API.
 * Takes a grant number and optional funder information to find matching grants.
 *
 * @example
 * ```typescript
 * const cmd = new ExtractGrantsCommand({
 *   grantNumber: "R01HL117329",
 *   fundref: "100000050"
 * });
 *
 * const result = await client.send(cmd);
 * console.log(result.extracted_grants);
 * // [{ id: "grant.xxx", title: "...", funder: "NIH", ... }]
 * ```
 */
export class ExtractGrantsCommand extends Command<
  ExtractGrantsCommandParsedInput,
  ExtractGrantsResponse
> {
  static readonly inputSchema = ExtractGrantsInputSchema;

  readonly input: ExtractGrantsCommandParsedInput;

  /**
   * Creates a new ExtractGrantsCommand.
   * @param input - Command input parameters
   * @throws {ValidationError} If input validation fails
   */
  constructor(input: ExtractGrantsInput) {
    super();
    this.input = validateInput(ExtractGrantsInputSchema, input);
  }

  /**
   * Resolves the DSL query for this command.
   * @returns The constructed DSL query string
   */
  resolveQuery(): string {
    const parts: string[] = [];

    parts.push(`grant_number="${escapeDslString(this.input.grantNumber)}"`);

    // Prefer fundref over funderName if both are provided
    if (this.input.fundref) {
      parts.push(`fundref="${escapeDslString(this.input.fundref)}"`);
    } else if (this.input.funderName) {
      parts.push(`funder_name="${escapeDslString(this.input.funderName)}"`);
    }

    return `extract_grants(${parts.join(", ")})`;
  }

  /**
   * Transforms raw API response to typed output.
   * @param response - Raw API response
   * @returns Typed extraction results
   * @throws {ValidationError} If response structure is invalid
   */
  transformResponse(response: unknown): ExtractGrantsResponse {
    const parseResult = ExtractGrantsResponseSchema.safeParse(response);

    if (!parseResult.success) {
      throw new ValidationError("Invalid API response structure", {
        zodErrors: parseResult.error.issues,
      });
    }

    return parseResult.data;
  }
}
