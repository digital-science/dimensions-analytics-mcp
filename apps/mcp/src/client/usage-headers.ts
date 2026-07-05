/**
 * X-Dimensions-* usage tracking headers for dsl-service.
 * @module client/usage-headers
 */

import { getActiveMcpTool, getMcpUsageSession } from "./usage-context.js";

export const USAGE_HEADER_CHANNEL = "X-Dimensions-Channel";
export const USAGE_HEADER_MCP_TOOL = "X-Dimensions-MCP-Tool";
export const USAGE_HEADER_MCP_SESSION_ID = "X-Dimensions-MCP-Session-Id";
export const USAGE_HEADER_MCP_CLIENT = "X-Dimensions-MCP-Client";
export const USAGE_HEADER_MCP_VERSION = "X-Dimensions-MCP-Version";
export const USAGE_HEADER_MCP_DEPLOYMENT = "X-Dimensions-MCP-Deployment";

/**
 * Builds usage tracking headers from the active MCP session and tool context.
 */
export function buildMcpUsageHeaders(): Record<string, string> {
  const session = getMcpUsageSession();
  if (!session) {
    return {};
  }

  const headers: Record<string, string> = {
    [USAGE_HEADER_CHANNEL]: "mcp",
    [USAGE_HEADER_MCP_SESSION_ID]: session.sessionId,
    [USAGE_HEADER_MCP_CLIENT]: session.client,
    [USAGE_HEADER_MCP_VERSION]: session.version,
    [USAGE_HEADER_MCP_DEPLOYMENT]: session.deployment,
  };

  const tool = getActiveMcpTool();
  if (tool) {
    headers[USAGE_HEADER_MCP_TOOL] = tool;
  }

  return headers;
}

/**
 * User-Agent string identifying the MCP server and client app.
 */
export function buildMcpUserAgent(version: string, client: string): string {
  return `dimensions-analytics-mcp/${version} (${client})`;
}
