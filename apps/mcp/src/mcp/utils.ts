/**
 * Utility functions for MCP tools.
 * @module mcp/utils
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import {
  buildPaginationMetadata,
  DimensionsError,
  largeResultWarning,
  type PaginationMetadata,
  POLICY_NOTICE,
} from "../dsl/index.js";

/** Annotations for read-only tools that call external APIs. */
export const READ_ONLY_API_ANNOTATIONS: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

/**
 * Coerces an unknown value to an array of records, returning `[]` if not an array.
 * Replaces unsafe `as Array<Record<string, unknown>>` casts from API responses.
 * @param value - Unknown value from a DSL response property
 * @returns The value as an array of records, or empty array if not an array
 */
export function asArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? (value as Array<Record<string, unknown>>) : [];
}

/**
 * MCP tool result format.
 * Includes index signature for MCP SDK compatibility.
 */
export interface ToolResult {
  [key: string]: unknown;
  content: Array<{
    type: "text";
    text: string;
  }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

/**
 * Formats a successful tool result.
 * Populates both `content` (text/JSON) and `structuredContent` for SDK output schema validation.
 * @param data - The data to return
 * @returns Formatted tool result
 */
export function formatToolResult(data: unknown): ToolResult {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(data, null, 2),
      },
    ],
    structuredContent: data as Record<string, unknown>,
  };
}

/**
 * Builds a JSON-serializable error payload for MCP tool responses.
 * Surfaces Dimensions API metadata (status codes, client rate-limit hints) when available.
 * @param error - The error that occurred
 * @returns Error payload object
 */
export function formatErrorPayload(error: unknown): Record<string, unknown> {
  if (error instanceof DimensionsError) {
    const json = error.toJSON();
    return {
      ...json,
      error: json.message,
      type: json.name,
    };
  }

  return {
    error: error instanceof Error ? error.message : String(error),
    type: error instanceof Error ? error.name : "Error",
  };
}

/**
 * Formats an error tool result.
 * @param error - The error that occurred
 * @returns Formatted error result
 */
export function formatErrorResult(error: unknown): ToolResult {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(formatErrorPayload(error), null, 2),
      },
    ],
    isError: true,
  };
}

/** Fields added to paginated search tool responses. */
export type SearchPaginationFields = {
  truncated?: boolean;
  truncationWarning?: string;
  pagination?: PaginationMetadata;
  largeResultWarning?: string;
  policyNotice?: string;
};

/**
 * Augments a search result with truncation warnings and pagination metadata.
 * @param data - The result data object
 * @param totalCount - Total matching records from the API
 * @param returnedCount - Records actually returned
 * @param skip - Current skip offset
 * @param pageSize - Page size used for this request
 * @returns The data object with pagination fields when applicable
 */
export function withSearchPagination<T extends Record<string, unknown>>(
  data: T,
  totalCount: number,
  returnedCount: number,
  skip: number,
  pageSize: number,
): T & SearchPaginationFields {
  const warning = largeResultWarning(totalCount);
  const truncated = totalCount > skip + returnedCount;
  const needsPagination = skip > 0 || truncated || warning !== undefined;

  if (!needsPagination) {
    return data;
  }

  const pagination = buildPaginationMetadata(skip, pageSize, totalCount);

  const showPolicyNotice = truncated || warning !== undefined;

  return {
    ...data,
    ...(warning ? { largeResultWarning: warning } : {}),
    ...(showPolicyNotice ? { policyNotice: POLICY_NOTICE } : {}),
    ...(truncated
      ? {
          truncated: true,
          truncationWarning:
            `Only ${returnedCount} of ${totalCount} results in this page (skip ${skip}). ` +
            "Use skip/page on search_* or fetch_search_pages for the next page; narrow filters when possible.",
        }
      : {}),
    pagination,
  };
}

/** Logging levels supported by the MCP protocol (syslog severity). */
export type McpLogLevel =
  | "debug"
  | "info"
  | "notice"
  | "warning"
  | "error"
  | "critical"
  | "alert"
  | "emergency";

/**
 * Sends a structured log message via the MCP protocol with stderr fallback.
 * @param server - MCP server instance
 * @param level - Log severity level
 * @param data - Structured log data (any JSON-serializable value)
 * @param logger - Optional logger namespace (e.g., "search", "schema")
 */
export function mcpLog(
  server: McpServer,
  level: McpLogLevel,
  data: unknown,
  logger?: string,
): void {
  server.sendLoggingMessage({ level, data, logger }).catch(() => {
    console.error(
      `[${level}]${logger ? ` [${logger}]` : ""} ${typeof data === "string" ? data : JSON.stringify(data)}`,
    );
  });
}
