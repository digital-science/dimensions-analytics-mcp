/**
 * MCP tool usage tracking helpers.
 * @module mcp/usage-tracking
 */

import { randomUUID } from "node:crypto";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import pkg from "../../package.json" with { type: "json" };
import {
  type McpDeploymentMode,
  runWithMcpTool,
  setMcpUsageSession,
} from "../client/usage-context.js";

export interface McpUsageTrackingOptions {
  readonly deployment: McpDeploymentMode;
  readonly client?: string;
  readonly sessionId?: string;
}

/**
 * Initializes session-level MCP usage metadata for a server instance.
 */
export function initMcpUsageTracking(options: McpUsageTrackingOptions): void {
  setMcpUsageSession({
    sessionId: options.sessionId ?? randomUUID(),
    deployment: options.deployment,
    client: options.client ?? "unknown",
    version: pkg.version,
  });
}

/**
 * Wraps a tool handler so the active tool name is available for usage headers.
 */
export function withMcpUsageTracking<TArgs, TResult>(
  toolName: string,
  handler: (args: TArgs) => TResult | Promise<TResult>,
): (args: TArgs) => Promise<TResult> {
  return async (args: TArgs) => runWithMcpTool(toolName, () => handler(args));
}

/**
 * Registers an MCP tool with usage tracking for dsl-service headers.
 */
export function registerTrackedTool(
  server: McpServer,
  toolName: string,
  config: Record<string, unknown>,
  // biome-ignore lint/suspicious/noExplicitAny: preserve MCP SDK tool handler inference
  handler: (args: any) => any,
): void {
  server.registerTool(
    toolName,
    config,
    withMcpUsageTracking(toolName, handler) as Parameters<McpServer["registerTool"]>[2],
  );
}

/**
 * Derives a coarse MCP client label from an HTTP User-Agent header.
 */
export function mcpClientFromUserAgent(userAgent: string | undefined): string {
  if (!userAgent) return "unknown";
  const ua = userAgent.toLowerCase();
  if (ua.includes("cursor")) return "cursor";
  if (ua.includes("claude")) return "claude-desktop";
  if (ua.includes("vscode") || ua.includes("visual studio code")) return "vscode";
  if (ua.includes("windsurf")) return "windsurf";
  if (ua.includes("copilot")) return "copilot";
  return "unknown";
}
