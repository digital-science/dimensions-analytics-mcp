/**
 * Schema introspection and validation tools for the MCP server.
 * @module mcp/tools/schema
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { DimensionsClient } from "../../dsl/index.js";
import { buildReverseAliasMap } from "../middleware/field-aliases.js";
import type { SchemaContext } from "../schema/context.js";
import { loadSchema, type SchemaStore } from "../schema/index.js";
import { formatErrorResult, formatToolResult, READ_ONLY_API_ANNOTATIONS } from "../utils.js";

/**
 * Registers schema introspection and validation tools.
 * @param server - MCP server instance
 * @param client - Dimensions client
 * @param context - Mutable schema context shared with refresh
 */
export function registerSchemaTools(
  server: McpServer,
  client: DimensionsClient,
  context: SchemaContext,
): void {
  server.registerTool(
    "describe_schema",
    {
      description:
        "Return Dimensions DSL schema metadata loaded at server startup. " +
        "Default: compact summary with source/entity counts and resource URIs. " +
        "Use full=true or dimensions://schema for the complete describe payload. " +
        "Optionally fetch live describe for a single source or entity.",
      inputSchema: {
        source: z.string().optional().describe("Source name (e.g. publications)"),
        entity: z.string().optional().describe("Auxiliary entity name (e.g. journals)"),
        full: z
          .boolean()
          .optional()
          .describe("When true, return the full raw describe schema instead of the summary"),
        live: z
          .boolean()
          .optional()
          .describe("When true, fetch fresh describe for source/entity from the API"),
      },
      outputSchema: {
        summary: z
          .record(z.string(), z.unknown())
          .optional()
          .describe("Compact schema overview (default response)"),
        schema: z
          .record(z.string(), z.unknown())
          .optional()
          .describe("Full or sliced schema when full=true or source/entity is set"),
        version: z.string().optional().describe("DSL version"),
        stats: z.record(z.string(), z.unknown()).optional().describe("Load stats and provenance"),
      },
      annotations: READ_ONLY_API_ANNOTATIONS,
    },
    async (args) => {
      try {
        if (args.live && args.source) {
          const raw = await client.rawQuery(`describe source ${args.source}`);
          return formatToolResult({ schema: raw });
        }
        if (args.live && args.entity) {
          const raw = await client.rawQuery(`describe entity ${args.entity}`);
          return formatToolResult({ schema: raw });
        }
        if (args.source) {
          const source = context.store.getSource(args.source);
          if (!source) {
            return formatErrorResult(new Error(`Unknown source: ${args.source}`));
          }
          return formatToolResult({ schema: source });
        }
        if (args.entity) {
          const entity = context.store.getEntity(args.entity);
          if (!entity) {
            return formatErrorResult(new Error(`Unknown entity: ${args.entity}`));
          }
          return formatToolResult({ schema: entity });
        }
        if (args.full) {
          return formatToolResult({
            schema: context.store.raw,
            version: context.store.version,
            stats: context.store.stats(),
          });
        }
        return formatToolResult({
          summary: context.store.summary(),
          version: context.store.version,
          stats: context.store.stats(),
        });
      } catch (error) {
        return formatErrorResult(error);
      }
    },
  );

  server.registerTool(
    "refresh_schema",
    {
      description:
        "Re-fetch describe schema from the Dimensions API, rebuild in-memory schema, and re-register MCP resources.",
      inputSchema: {},
      outputSchema: {
        refreshed: z.boolean(),
        stats: z.record(z.string(), z.unknown()),
      },
      annotations: READ_ONLY_API_ANNOTATIONS,
    },
    async () => {
      try {
        const store = await loadSchema(client, {
          cachePath: process.env.SCHEMA_CACHE_PATH,
          forceRefresh: true,
        });
        context.store = store;
        return formatToolResult({ refreshed: true, stats: store.stats() });
      } catch (error) {
        return formatErrorResult(error);
      }
    },
  );
}

/**
 * Validates field aliases against loaded schema; logs warnings for unknown targets.
 * @param schemaStore - Loaded schema store
 */
export function validateFieldAliases(schemaStore: SchemaStore): void {
  for (const entity of schemaStore.structuredEntityTypes()) {
    const filterable = new Set(schemaStore.filterableFields(entity));
    const reverse = buildReverseAliasMap(entity);
    for (const [canonical, aliases] of reverse) {
      if (!filterable.has(canonical)) {
        console.error(
          `Field alias warning: ${entity}.${canonical} not in describe filterable fields (aliases: ${aliases.join(", ")})`,
        );
      }
    }
  }
}
