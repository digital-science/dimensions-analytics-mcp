/**
 * MCP tool for constructing canonical Dimensions profile URLs.
 * @module mcp/tools/profile-url
 */

import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { buildProfileUrl, isProfileEntityType, PROFILE_ENTITY_TYPES } from "../profile-urls.js";
import { registerTrackedTool } from "../usage-tracking.js";
import { formatErrorResult, formatToolResult, READ_ONLY_API_ANNOTATIONS } from "../utils.js";

const profileEntityEnum = z.enum(PROFILE_ENTITY_TYPES as [string, ...string[]]);

/**
 * Registers `construct_profile_url`.
 * @param server - MCP server instance
 */
export function registerProfileUrlTool(server: McpServer): void {
  registerTrackedTool(
    server,
    "construct_profile_url",
    {
      description:
        "Build a canonical Dimensions web profile URL from an entity type and Dimensions ID. " +
        "Use this instead of inventing paths — researcher profiles are " +
        "/details/entities/publication/author/{id} (not /discover/researcher/{id}); " +
        "organization profiles are /details/organization/{id}. " +
        "search_*, get_by_*, similar_documents, and facet_query already attach profile_url when possible.",
      inputSchema: z.object({
        entityType: profileEntityEnum.describe(
          "Entity type with a web profile (e.g. researchers, organizations, publications)",
        ),
        id: z.string().min(1).describe("Dimensions ID (e.g. ur.01222634304.39, grid.168010.e)"),
      }),
      outputSchema: z.object({
        entityType: z.string().describe("Entity type"),
        id: z.string().describe("Dimensions ID"),
        profile_url: z.string().describe("Canonical Dimensions web profile URL"),
      }),
      annotations: {
        ...READ_ONLY_API_ANNOTATIONS,
        openWorldHint: false,
      },
    },
    async (args) => {
      try {
        const entityType = args.entityType as string;
        const id = args.id as string;
        if (!isProfileEntityType(entityType)) {
          return formatErrorResult(
            new Error(
              `No canonical Dimensions profile URL for entity type: ${entityType}. Supported: ${PROFILE_ENTITY_TYPES.join(", ")}`,
            ),
          );
        }
        const profileUrl = buildProfileUrl(entityType, id);
        if (!profileUrl) {
          return formatErrorResult(new Error("A non-empty Dimensions ID is required"));
        }
        return formatToolResult({
          entityType,
          id: id.trim(),
          profile_url: profileUrl,
        });
      } catch (error) {
        return formatErrorResult(error);
      }
    },
  );
}
