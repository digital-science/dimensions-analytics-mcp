/**
 * Lookup tools for the MCP server.
 * Provides direct lookup by identifiers (DOI, PMID, Dimensions ID).
 * @module mcp/tools/lookup
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { type DimensionsClient, EntitySchema, type EntityType } from "../../dsl/index.js";
import { withFieldAliases } from "../middleware/field-aliases.js";
import {
  asArray,
  formatErrorResult,
  formatToolResult,
  READ_ONLY_API_ANNOTATIONS,
} from "../utils.js";

/**
 * Registers all lookup tools with the MCP server.
 * @param server - MCP server instance
 * @param client - Dimensions client instance
 */
export function registerLookupTools(server: McpServer, client: DimensionsClient): void {
  // Get publication by DOI
  server.registerTool(
    "get_by_doi",
    {
      description:
        "Retrieve a publication by its Digital Object Identifier (DOI). Returns full publication details including abstract, citations, and authors.",
      inputSchema: {
        doi: z.string().describe("The DOI to look up (e.g., '10.1038/nature12373')"),
        fields: z
          .array(z.string())
          .optional()
          .describe("Fields to return (e.g., ['id', 'title', 'abstract', 'times_cited'])"),
      },
      outputSchema: {
        found: z.boolean().describe("Whether the entity was found"),
        publication: z.record(z.string(), z.unknown()).optional().describe("The found entity"),
        message: z.string().optional().describe("Message when not found"),
      },
      annotations: READ_ONLY_API_ANNOTATIONS,
    },
    withFieldAliases(
      { entitySource: { kind: "static", entity: "publications" }, fieldArrayArgs: ["fields"] },
      async (args) => {
        try {
          const qb = client
            .createQueryBuilder()
            .search("publications")
            .where("doi", "=", args.doi)
            .limit(1);
          if (args.fields?.length) qb.fields(args.fields);
          const dsl = qb.build();

          const response = await client.rawQuery(dsl);
          const publications = asArray(response.publications);

          if (publications.length === 0) {
            return formatToolResult({
              found: false,
              message: `No publication found with DOI: ${args.doi}`,
            });
          }

          return formatToolResult({
            found: true,
            publication: publications[0],
          });
        } catch (error) {
          return formatErrorResult(error);
        }
      },
    ),
  );

  // Get publication by PubMed ID
  server.registerTool(
    "get_by_pmid",
    {
      description:
        "Retrieve a publication by its PubMed ID (PMID). Returns full publication details from Dimensions.",
      inputSchema: {
        pmid: z.string().describe("The PubMed ID to look up (e.g., '23846567')"),
        fields: z
          .array(z.string())
          .optional()
          .describe("Fields to return (e.g., ['id', 'title', 'abstract', 'times_cited'])"),
      },
      outputSchema: {
        found: z.boolean().describe("Whether the entity was found"),
        publication: z.record(z.string(), z.unknown()).optional().describe("The found entity"),
        message: z.string().optional().describe("Message when not found"),
      },
      annotations: READ_ONLY_API_ANNOTATIONS,
    },
    withFieldAliases(
      { entitySource: { kind: "static", entity: "publications" }, fieldArrayArgs: ["fields"] },
      async (args) => {
        try {
          const qb = client
            .createQueryBuilder()
            .search("publications")
            .where("pmid", "=", args.pmid)
            .limit(1);
          if (args.fields?.length) qb.fields(args.fields);
          const dsl = qb.build();

          const response = await client.rawQuery(dsl);
          const publications = asArray(response.publications);

          if (publications.length === 0) {
            return formatToolResult({
              found: false,
              message: `No publication found with PMID: ${args.pmid}`,
            });
          }

          return formatToolResult({
            found: true,
            publication: publications[0],
          });
        } catch (error) {
          return formatErrorResult(error);
        }
      },
    ),
  );

  // Get entity by Dimensions ID
  server.registerTool(
    "get_by_id",
    {
      description:
        "Retrieve any entity by its Dimensions ID. Supports publications, grants, patents, clinical trials, datasets, policy documents, researchers, and organizations.",
      inputSchema: {
        entityType: EntitySchema.describe("The type of entity to look up"),
        id: z.string().describe("The Dimensions ID to look up"),
        fields: z.array(z.string()).optional().describe("Fields to return"),
      },
      outputSchema: {
        found: z.boolean().describe("Whether the entity was found"),
        entity: z.record(z.string(), z.unknown()).optional().describe("The found entity"),
        entityType: z.string().optional().describe("The type of the found entity"),
        message: z.string().optional().describe("Message when not found"),
      },
      annotations: READ_ONLY_API_ANNOTATIONS,
    },
    withFieldAliases(
      { entitySource: { kind: "dynamic", argName: "entityType" }, fieldArrayArgs: ["fields"] },
      async (args) => {
        try {
          const qb = client
            .createQueryBuilder()
            .search(args.entityType as EntityType)
            .where("id", "=", args.id)
            .limit(1);
          if (args.fields?.length) qb.fields(args.fields);
          const dsl = qb.build();

          const response = await client.rawQuery(dsl);
          const entities = asArray(response[args.entityType]);

          if (entities.length === 0) {
            return formatToolResult({
              found: false,
              message: `No ${args.entityType.slice(0, -1)} found with ID: ${args.id}`,
            });
          }

          return formatToolResult({
            found: true,
            entity: entities[0],
            entityType: args.entityType,
          });
        } catch (error) {
          return formatErrorResult(error);
        }
      },
    ),
  );
}
