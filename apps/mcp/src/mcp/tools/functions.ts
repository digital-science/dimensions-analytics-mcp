/**
 * Special function tools for the MCP server.
 * Entity resolution helpers (affiliations, grants).
 * @module mcp/tools/functions
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { DimensionsClient } from "../../dsl/index.js";
import { formatErrorResult, formatToolResult, READ_ONLY_API_ANNOTATIONS } from "../utils.js";

/**
 * Registers special function tools with the MCP server.
 * @param server - MCP server instance
 * @param client - Dimensions client instance
 */
export function registerFunctionTools(server: McpServer, client: DimensionsClient): void {
  server.registerTool(
    "extract_affiliations",
    {
      description:
        "Resolve and disambiguate organization affiliations using Dimensions entity resolution. " +
        "Takes freetext affiliation strings or structured organization data and returns matched " +
        "organizations with GRID/ROR identifiers and confidence scores.",
      inputSchema: {
        affiliations: z
          .array(
            z.object({
              affiliation: z
                .string()
                .optional()
                .describe("Freetext affiliation string (e.g., 'University of Oxford, UK')"),
              name: z.string().optional().describe("Organization name"),
              city: z.string().optional().describe("City"),
              state: z.string().optional().describe("State/province"),
              country: z.string().optional().describe("Country"),
            }),
          )
          .min(1)
          .describe(
            "Array of affiliations to resolve. Each must have either 'affiliation' or 'name'",
          ),
      },
      outputSchema: {
        matchCount: z.number().describe("Number of resolved affiliations"),
        affiliations: z.array(z.record(z.string(), z.unknown())).describe("Resolved affiliations"),
      },
      annotations: READ_ONLY_API_ANNOTATIONS,
    },
    async (args) => {
      try {
        const result = await client.extractAffiliations(args.affiliations);

        return formatToolResult({
          matchCount: result.extracted_affiliations.length,
          affiliations: result.extracted_affiliations,
        });
      } catch (error) {
        return formatErrorResult(error);
      }
    },
  );

  server.registerTool(
    "extract_grants",
    {
      description:
        "Resolve grant numbers to Dimensions grant records. " +
        "Takes a grant number and optional funder information to find matching grants " +
        "with full metadata including funding amounts, dates, and funder details.",
      inputSchema: {
        grant_number: z.string().min(1).describe("Grant number to look up (e.g., 'R01HL117329')"),
        fundref: z
          .string()
          .optional()
          .describe("FundRef ID of the funder (e.g., '100000050' for NIH)"),
        funder_name: z
          .string()
          .optional()
          .describe("Funder name as alternative to FundRef ID (e.g., 'NIH')"),
      },
      outputSchema: {
        matchCount: z.number().describe("Number of matched grants"),
        grants: z.array(z.record(z.string(), z.unknown())).describe("Matched grant records"),
      },
      annotations: READ_ONLY_API_ANNOTATIONS,
    },
    async (args) => {
      try {
        const result = await client.extractGrants({
          grantNumber: args.grant_number,
          fundref: args.fundref,
          funderName: args.funder_name,
        });

        return formatToolResult({
          matchCount: result.grant_id ? 1 : 0,
          grants: result.grant_id ? [{ grant_id: result.grant_id }] : [],
        });
      } catch (error) {
        return formatErrorResult(error);
      }
    },
  );
}
