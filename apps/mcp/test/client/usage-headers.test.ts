/**
 * Tests for MCP usage header builder.
 * @module test/client/usage-headers
 */

import { describe, expect, it } from "vitest";
import { runWithMcpTool, setMcpUsageSession } from "../../src/client/usage-context.js";
import {
  buildMcpUsageHeaders,
  buildMcpUserAgent,
  USAGE_HEADER_CHANNEL,
  USAGE_HEADER_MCP_TOOL,
} from "../../src/client/usage-headers.js";

describe("buildMcpUsageHeaders", () => {
  it("returns empty object when no session is configured", () => {
    expect(buildMcpUsageHeaders()).toEqual({});
  });

  it("includes session fields and active tool name", () => {
    setMcpUsageSession({
      sessionId: "session-1",
      deployment: "local",
      client: "stdio",
      version: "1.0.4",
    });

    const headers = runWithMcpTool("execute_dsl", () => buildMcpUsageHeaders());

    expect(headers).toEqual({
      [USAGE_HEADER_CHANNEL]: "mcp",
      "X-Dimensions-MCP-Session-Id": "session-1",
      "X-Dimensions-MCP-Client": "stdio",
      "X-Dimensions-MCP-Version": "1.0.4",
      "X-Dimensions-MCP-Deployment": "local",
      [USAGE_HEADER_MCP_TOOL]: "execute_dsl",
    });
  });
});

describe("buildMcpUserAgent", () => {
  it("formats version and client", () => {
    expect(buildMcpUserAgent("1.0.4", "cursor")).toBe("dimensions-analytics-mcp/1.0.4 (cursor)");
  });
});
