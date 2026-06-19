/**
 * Search tools for the MCP server.
 * Registers `search_{source}` tools from describe schema and shared QueryBuilder handlers.
 * @module mcp/tools/search
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { DimensionsClient } from "../../dsl/index.js";
import {
  applyFilters,
  type ExtendedWhereFilterInput,
  parseEntityResponse,
  resolveSkipAndLimit,
  type SchemaStore,
  type StructuredEntityType,
  searchResultKey,
  searchToolName,
  validateSearchPaginationPolicy,
} from "../../dsl/index.js";
import { withFieldAliases } from "../middleware/field-aliases.js";
import {
  formatErrorResult,
  formatToolResult,
  READ_ONLY_API_ANNOTATIONS,
  withSearchPagination,
} from "../utils.js";
import { SEARCH_ENTITY_METADATA } from "./search-entity-metadata.js";
import { PAGINATION_OUTPUT_SCHEMA, SHARED_SEARCH_INPUT } from "./search-input.js";

const metadataBySource = new Map(
  SEARCH_ENTITY_METADATA.map((meta) => [meta.source, meta] as const),
);

/**
 * Builds DSL for a structured search from tool arguments.
 * @param client - Dimensions client
 * @param source - Dimensions source name
 * @param args - Tool arguments (after field-alias resolution)
 * @returns DSL query string
 */
export function buildStructuredSearchDsl(
  client: DimensionsClient,
  source: StructuredEntityType,
  args: Record<string, unknown>,
): string {
  const meta = metadataBySource.get(source);
  const builder = client.createQueryBuilder().search(source);

  if (typeof args.query === "string" && args.query.length > 0) {
    builder.for(args.query);
  }

  meta?.applyConvenienceFilters(builder, args);

  const filters = args.filters as ExtendedWhereFilterInput[] | undefined;
  if (filters?.length) {
    applyFilters(builder, filters);
  }

  const fields = args.fields as string[] | undefined;
  if (fields?.length) {
    builder.fields(fields);
  }

  if (typeof args.sortBy === "string") {
    builder.sort(args.sortBy, "desc");
  }

  const { skip, limit } = resolveSkipAndLimit({
    skip: args.skip as number | undefined,
    page: args.page as number | undefined,
    limit: args.limit as number | undefined,
    pageSize: args.pageSize as number | undefined,
  });
  builder.limit(limit);
  if (skip > 0) {
    builder.skip(skip);
  }

  return builder.build();
}

/**
 * Registers structured search tools for sources present in the schema store.
 * @param server - MCP server instance
 * @param client - Dimensions client instance
 * @param schemaStore - Loaded describe schema
 */
export function registerSearchTools(
  server: McpServer,
  client: DimensionsClient,
  schemaStore: SchemaStore,
): void {
  for (const source of schemaStore.structuredEntityTypes()) {
    const meta = metadataBySource.get(source);
    if (!meta) continue;

    const resultKey = searchResultKey(source);
    const toolName = searchToolName(source);

    server.registerTool(
      toolName,
      {
        description: meta.description,
        inputSchema: {
          ...SHARED_SEARCH_INPUT,
          ...meta.extraInputSchema,
        },
        outputSchema: {
          totalCount: z.number().describe("Total matching records"),
          returnedCount: z.number().describe("Records returned in this response"),
          truncated: z
            .boolean()
            .optional()
            .describe("True when more results exist beyond this page"),
          truncationWarning: z.string().optional().describe("Warning message when truncated"),
          ...PAGINATION_OUTPUT_SCHEMA,
          [resultKey]: z.array(z.record(z.string(), z.unknown())).describe("Result records"),
        },
        annotations: READ_ONLY_API_ANNOTATIONS,
      },
      withFieldAliases(
        {
          entitySource: { kind: "static", entity: source },
          fieldArrayArgs: ["fields"],
          fieldStringArgs: ["sortBy"],
          filterArrayArgs: ["filters"],
        },
        async (args) => {
          try {
            const record = args as Record<string, unknown>;
            const { skip, limit } = resolveSkipAndLimit({
              skip: record.skip as number | undefined,
              page: record.page as number | undefined,
              limit: record.limit as number | undefined,
            });
            validateSearchPaginationPolicy({
              skip,
              limit,
              confirmLargeFetch: record.confirmLargeFetch as boolean | undefined,
            });
            const dsl = buildStructuredSearchDsl(client, source, record);
            const response = (await client.rawQuery(dsl)) as Record<string, unknown>;
            const parsed = parseEntityResponse(response, source);
            const rows = parsed.data as Record<string, unknown>[];

            return formatToolResult(
              withSearchPagination(
                {
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
}
