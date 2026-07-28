/**
 * similar_documents MCP tool — find publications/grants with similar topics via DSL.
 * Uses concept extraction + weighted concepts search (not vector embeddings).
 * @module mcp/tools/similar-documents
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { DimensionsClient } from "../../dsl/index.js";
import {
  applyFilters,
  type ExtendedWhereFilterInput,
  ExtendedWhereFilterSchema,
  parseEntityResponse,
  resolveSkipAndLimit,
  SCHEMA_LIMITS,
  type StructuredEntityType,
  searchResultKey,
  validateSearchPaginationPolicy,
} from "../../dsl/index.js";
import { withFieldAliases } from "../middleware/field-aliases.js";
import { registerTrackedTool } from "../usage-tracking.js";
import {
  formatErrorResult,
  formatToolResult,
  READ_ONLY_API_ANNOTATIONS,
  withSearchPagination,
} from "../utils.js";
import { PAGINATION_INPUT_SCHEMA, PAGINATION_OUTPUT_SCHEMA } from "./search-input.js";

/** Entity types that support the DSL similar_documents() search function. */
export const SIMILAR_DOCUMENTS_ENTITY_TYPES = ["publications", "grants"] as const;

/** Entity type supported by similar_documents. */
export type SimilarDocumentsEntityType = (typeof SIMILAR_DOCUMENTS_ENTITY_TYPES)[number];

/** Year filter field per entity (publications use year; grants use start_year). */
const YEAR_FIELD: Record<SimilarDocumentsEntityType, string> = {
  publications: "year",
  grants: "start_year",
};

/**
 * Builds DSL for a similar_documents search from tool arguments.
 * @param client - Dimensions client
 * @param entityType - publications or grants
 * @param args - Tool arguments (after field-alias resolution)
 * @returns DSL query string
 */
export function buildSimilarDocumentsDsl(
  client: DimensionsClient,
  entityType: SimilarDocumentsEntityType,
  args: Record<string, unknown>,
): string {
  const text = String(args.text ?? "");
  const builder = client.createQueryBuilder().search(entityType).forSimilar(text);

  const yearField = YEAR_FIELD[entityType];
  if (typeof args.yearFrom === "number") {
    builder.where(yearField, ">=", args.yearFrom);
  }
  if (typeof args.yearTo === "number") {
    builder.where(yearField, "<=", args.yearTo);
  }

  const filters = args.filters as ExtendedWhereFilterInput[] | undefined;
  if (filters?.length) {
    applyFilters(builder, filters);
  }

  const fields = args.fields as string[] | undefined;
  if (fields?.length) {
    builder.fields(fields);
  }

  const sortBy = typeof args.sortBy === "string" ? args.sortBy : "score";
  builder.sort(sortBy, "desc");

  // Default to 20 for similarity (top-N relevance), not the search_* default of 100.
  const { skip, limit } = resolveSkipAndLimit({
    skip: args.skip as number | undefined,
    page: args.page as number | undefined,
    limit: (args.limit as number | undefined) ?? 20,
    pageSize: args.pageSize as number | undefined,
  });
  builder.limit(limit);
  if (skip > 0) {
    builder.skip(skip);
  }

  return builder.build();
}

/**
 * Registers the similar_documents tool with the MCP server.
 * @param server - MCP server instance
 * @param client - Dimensions client instance
 */
export function registerSimilarDocumentsTool(server: McpServer, client: DimensionsClient): void {
  registerTrackedTool(
    server,
    "similar_documents",
    {
      description:
        "Find publications or grants with similar research topics based on abstract/description text. " +
        "Uses Dimensions concept extraction and weighted concepts search (not vector embeddings). " +
        "Prefer this over execute_dsl for similarity. For a known record: get_by_id / get_by_doi first, " +
        "then pass its abstract/description as text. Supported entityType: publications, grants only.",
      inputSchema: {
        entityType: z
          .enum(SIMILAR_DOCUMENTS_ENTITY_TYPES)
          .describe("Entity type to search (publications or grants)"),
        text: z
          .string()
          .min(1)
          .describe(
            "Abstract, description, or other prose to find similar documents for. " +
              "Longer topical text works better than short keywords.",
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(SCHEMA_LIMITS.maxLimit)
          .default(20)
          .describe(`Maximum results to return (max ${SCHEMA_LIMITS.maxLimit}, default 20)`),
        ...PAGINATION_INPUT_SCHEMA,
        fields: z
          .array(z.string())
          .optional()
          .describe(
            "Fields to return. Accepts aliases or DSL names. Use dimensions://fields/{entity} for the full list.",
          ),
        filters: z
          .array(ExtendedWhereFilterSchema)
          .optional()
          .describe("Additional where-clause filters"),
        yearFrom: z
          .number()
          .int()
          .optional()
          .describe("Filter from this year inclusive (publications: year; grants: start_year)"),
        yearTo: z
          .number()
          .int()
          .optional()
          .describe("Filter up to this year inclusive (publications: year; grants: start_year)"),
        sortBy: z
          .string()
          .optional()
          .describe(
            "Sort field (default: score for relevance). Examples: score, times_cited, year, start_year.",
          ),
        confirmLargeFetch: z
          .boolean()
          .optional()
          .default(false)
          .describe(
            "Required when skip≥5000, page≥5, or limit=1000 with skip>0. See dimensions://schema/policy.",
          ),
      },
      outputSchema: {
        entityType: z.enum(SIMILAR_DOCUMENTS_ENTITY_TYPES).describe("Entity type searched"),
        totalCount: z.number().describe("Total matching records"),
        returnedCount: z.number().describe("Records returned in this response"),
        truncated: z.boolean().optional().describe("True when more results exist beyond this page"),
        truncationWarning: z.string().optional().describe("Warning message when truncated"),
        ...PAGINATION_OUTPUT_SCHEMA,
        publications: z
          .array(z.record(z.string(), z.unknown()))
          .optional()
          .describe("Matching publications (when entityType is publications)"),
        grants: z
          .array(z.record(z.string(), z.unknown()))
          .optional()
          .describe("Matching grants (when entityType is grants)"),
      },
      annotations: READ_ONLY_API_ANNOTATIONS,
    },
    withFieldAliases(
      {
        entitySource: { kind: "dynamic", argName: "entityType" },
        fieldArrayArgs: ["fields"],
        fieldStringArgs: ["sortBy"],
        filterArrayArgs: ["filters"],
      },
      async (args) => {
        try {
          const entityType = args.entityType as SimilarDocumentsEntityType;
          const record = args as Record<string, unknown>;
          const { skip, limit } = resolveSkipAndLimit({
            skip: record.skip as number | undefined,
            page: record.page as number | undefined,
            limit: (record.limit as number | undefined) ?? 20,
          });

          validateSearchPaginationPolicy({
            skip,
            limit,
            confirmLargeFetch: record.confirmLargeFetch as boolean | undefined,
          });

          const dsl = buildSimilarDocumentsDsl(client, entityType, {
            ...record,
            limit,
          });
          const response = (await client.rawQuery(dsl)) as Record<string, unknown>;
          const parsed = parseEntityResponse(response, entityType as StructuredEntityType);
          const rows = parsed.data as Record<string, unknown>[];
          const resultKey = searchResultKey(entityType as StructuredEntityType);

          return formatToolResult(
            withSearchPagination(
              {
                entityType,
                totalCount: parsed.totalCount,
                returnedCount: rows.length,
                [resultKey]: rows,
              },
              parsed.totalCount,
              rows.length,
              skip,
              limit,
            ),
          );
        } catch (error) {
          return formatErrorResult(error);
        }
      },
    ),
  );
}
