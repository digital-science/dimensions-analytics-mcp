/**
 * Command for extracting/resolving affiliations using the Dimensions API.
 * @module commands/functions/ExtractAffiliationsCommand
 */

import { z } from "zod";
import { Command, ValidationError } from "../../../client/index.js";
import type {
  AffiliationInput,
  ExtractAffiliationsInput,
  ExtractAffiliationsResponse,
} from "../../types/special-functions.js";
import { escapeDslString } from "../../utils/escape.js";
import { validateInput } from "../validate-input.js";

/**
 * Schema for a single affiliation input.
 * Must have either affiliation (freetext) or at least name (structured).
 */
const AffiliationInputSchema = z
  .object({
    affiliation: z.string().optional().describe("Freetext affiliation string"),
    name: z.string().optional().describe("Organization name"),
    city: z.string().optional().describe("City"),
    state: z.string().optional().describe("State/province"),
    country: z.string().optional().describe("Country"),
  })
  .refine((data) => data.affiliation || data.name, {
    message: "At least one of affiliation (freetext) or name (structured) must be provided",
  });

/**
 * Zod schema for ExtractAffiliationsCommand input validation.
 */
export const ExtractAffiliationsInputSchema = z.object({
  affiliations: z
    .array(AffiliationInputSchema)
    .min(1, "At least one affiliation must be provided")
    .describe("Array of affiliations to resolve"),
  results: z
    .enum(["basic", "full", "publisher"])
    .optional()
    .describe('Results detail level: "basic" (default), "full", or "publisher"'),
});

/**
 * Input type for ExtractAffiliationsCommand (raw input).
 */
export type ExtractAffiliationsCommandInput = z.input<typeof ExtractAffiliationsInputSchema>;

/**
 * Parsed input type for ExtractAffiliationsCommand (after validation).
 */
export type ExtractAffiliationsCommandParsedInput = z.output<typeof ExtractAffiliationsInputSchema>;

/**
 * Schema for a single affiliation result.
 */
const AffiliationResultSchema = z.object({
  id: z.string(),
  name: z.string(),
  country: z.string().optional(),
  score: z.number().optional(),
});

/**
 * Zod schema for validating API response structure.
 */
const ExtractAffiliationsResponseSchema = z.object({
  extracted_affiliations: z.array(AffiliationResultSchema),
});

/**
 * Converts an affiliation input to its JSON representation for DSL.
 * @param aff - The affiliation input
 * @returns JSON object string
 */
function affiliationToJsonObject(aff: AffiliationInput): string {
  const parts: string[] = [];

  if (aff.affiliation) {
    parts.push(`"affiliation": "${escapeDslString(aff.affiliation)}"`);
  }
  if (aff.name) {
    parts.push(`"name": "${escapeDslString(aff.name)}"`);
  }
  if (aff.city) {
    parts.push(`"city": "${escapeDslString(aff.city)}"`);
  }
  if (aff.state) {
    parts.push(`"state": "${escapeDslString(aff.state)}"`);
  }
  if (aff.country) {
    parts.push(`"country": "${escapeDslString(aff.country)}"`);
  }

  return `{${parts.join(", ")}}`;
}

/**
 * Command for extracting/resolving affiliations using the Dimensions API.
 * Takes freetext or structured affiliation data and returns matched organizations.
 *
 * @example
 * ```typescript
 * const cmd = new ExtractAffiliationsCommand({
 *   affiliations: [
 *     { affiliation: "University of Oxford, UK" },
 *     { name: "Stanford", city: "Stanford", country: "USA" }
 *   ]
 * });
 *
 * const result = await client.send(cmd);
 * console.log(result.extracted_affiliations);
 * // [{ id: "grid.xxx", name: "University of Oxford", ... }, ...]
 * ```
 */
export class ExtractAffiliationsCommand extends Command<
  ExtractAffiliationsCommandParsedInput,
  ExtractAffiliationsResponse
> {
  static readonly inputSchema = ExtractAffiliationsInputSchema;

  readonly input: ExtractAffiliationsCommandParsedInput;

  /**
   * Creates a new ExtractAffiliationsCommand.
   * @param input - Command input parameters
   * @throws {ValidationError} If input validation fails
   */
  constructor(input: ExtractAffiliationsInput) {
    super();
    this.input = validateInput(ExtractAffiliationsInputSchema, input);
  }

  /**
   * Resolves the DSL query for this command.
   * @returns The constructed DSL query string
   */
  resolveQuery(): string {
    const jsonObjects = this.input.affiliations.map(affiliationToJsonObject);
    const resultsSuffix = this.input.results ? `, results="${this.input.results}"` : "";
    return `extract_affiliations(json=[${jsonObjects.join(", ")}]${resultsSuffix})`;
  }

  /**
   * Transforms raw API response to typed output.
   * @param response - Raw API response
   * @returns Typed extraction results
   * @throws {ValidationError} If response structure is invalid
   */
  transformResponse(response: unknown): ExtractAffiliationsResponse {
    const parseResult = ExtractAffiliationsResponseSchema.safeParse(response);

    if (!parseResult.success) {
      throw new ValidationError("Invalid API response structure", {
        zodErrors: parseResult.error.issues,
      });
    }

    return parseResult.data;
  }
}
