/**
 * Query tools for the MCP server.
 * Provides raw DSL query execution for power users.
 * @module mcp/tools/query
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  buildExecuteDslPolicyHints,
  type DimensionsClient,
  validateExecuteDslPolicy,
} from "../../dsl/index.js";
import type { SchemaStore } from "../schema/index.js";
import { formatErrorResult, formatToolResult } from "../utils.js";

/**
 * Registers the raw DSL query tool with the MCP server.
 * @param server - MCP server instance
 * @param client - Dimensions client instance
 * @param schemaStore - Loaded describe schema for enriched descriptions
 */
export function registerQueryTools(
  server: McpServer,
  client: DimensionsClient,
  schemaStore: SchemaStore,
): void {
  const sources = schemaStore.structuredEntityTypes().join(", ");
  server.registerTool(
    "execute_dsl",
    {
      description: `Execute a raw Dimensions DSL query. Read dimensions://schema/policy and dimensions://examples first. Official docs: https://docs.dimensions.ai/dsl/

Prefer search_* tools for keyword search with yearFrom/yearTo and sortBy — they build valid DSL automatically.
Use fetch_search_pages for multi-page entity retrieval; facets cannot be paginated (max 1000 buckets).

DSL modifier order (required): return <entity>[fields] sort by <field> desc limit <n> skip <n>
- Use "sort by", not "sort"
- Put sort before limit (limit before sort causes a syntax error)
- Deep pagination (skip≥5000 or page≥5) requires confirmLargeFetch: true

Examples:
- search publications for "CRISPR" where year >= 2020 return publications[id+title+times_cited] sort by times_cited desc limit 20
- search publications return publications facet journal limit 20
- return funders aggregate funding_usd

Structured entity types: ${sources}`,
      inputSchema: {
        dsl: z.string().describe("Complete DSL query string to execute"),
        confirmLargeFetch: z
          .boolean()
          .optional()
          .default(false)
          .describe(
            "Required for deep pagination in DSL (skip≥5000). See dimensions://schema/policy.",
          ),
      },
      outputSchema: {
        result: z.record(z.string(), z.unknown()).describe("Raw DSL query response"),
        policyNotice: z.string().optional().describe("Reasonable-use reminder"),
        largeResultWarning: z
          .string()
          .optional()
          .describe("Warning when total_count exceeds 10,000"),
        paginationHint: z
          .string()
          .optional()
          .describe("Pagination guidance when results are truncated"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (args) => {
      try {
        validateExecuteDslPolicy({
          dsl: args.dsl,
          confirmLargeFetch: args.confirmLargeFetch,
        });
        const response = (await client.rawQuery(args.dsl)) as Record<string, unknown>;
        const hints = buildExecuteDslPolicyHints(args.dsl, response);
        return formatToolResult({ result: response, ...hints });
      } catch (error) {
        return formatErrorResult(error);
      }
    },
  );
}
