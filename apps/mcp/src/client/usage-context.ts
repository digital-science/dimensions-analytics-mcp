/**
 * Async-local MCP usage context for dsl-service request headers.
 * @module client/usage-context
 */

import { AsyncLocalStorage } from "node:async_hooks";

export type McpDeploymentMode = "hosted" | "local";

export interface McpUsageSession {
  readonly sessionId: string;
  readonly deployment: McpDeploymentMode;
  readonly client: string;
  readonly version: string;
}

export interface McpUsageCall {
  readonly tool: string;
}

const sessionStorage = new AsyncLocalStorage<McpUsageSession>();
const callStorage = new AsyncLocalStorage<McpUsageCall>();

let activeSession: McpUsageSession | undefined;

/**
 * Installs session-level MCP usage metadata for the lifetime of a server instance.
 */
export function setMcpUsageSession(session: McpUsageSession): void {
  activeSession = session;
}

export function getMcpUsageSession(): McpUsageSession | undefined {
  return sessionStorage.getStore() ?? activeSession;
}

/**
 * Runs a function with session-level usage context (nested over the active session).
 */
export function runWithMcpUsageSession<T>(session: McpUsageSession, fn: () => T): T {
  return sessionStorage.run(session, fn);
}

/**
 * Runs an MCP tool handler with per-call usage context (tool name).
 */
export function runWithMcpTool<T>(tool: string, fn: () => T): T {
  return callStorage.run({ tool }, fn);
}

export function getActiveMcpTool(): string | undefined {
  return callStorage.getStore()?.tool;
}
