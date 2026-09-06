/**
 * Tests for construct_profile_url.
 * @module test/tools/profile-url
 */

import { beforeEach, describe, expect, it } from "vitest";
import { registerProfileUrlTool } from "../../src/mcp/tools/profile-url.js";
import { callTool, createMockServer, parseToolResult } from "../helpers/tool-test-harness.js";

describe("construct_profile_url", () => {
  let handlers: ReturnType<typeof createMockServer>["handlers"];

  beforeEach(() => {
    const { server, handlers: h } = createMockServer();
    handlers = h;
    registerProfileUrlTool(server as never);
  });

  it("constructs a researcher profile URL", async () => {
    const result = await callTool(handlers, "construct_profile_url", {
      entityType: "researchers",
      id: "ur.01222634304.39",
    });
    const data = parseToolResult(result);

    expect(result.isError).toBeUndefined();
    expect(data).toEqual({
      entityType: "researchers",
      id: "ur.01222634304.39",
      profile_url:
        "https://app.dimensions.ai/details/entities/publication/author/ur.01222634304.39",
    });
  });

  it("constructs an organization profile URL", async () => {
    const result = await callTool(handlers, "construct_profile_url", {
      entityType: "organizations",
      id: "grid.168010.e",
    });
    expect(parseToolResult(result).profile_url).toBe(
      "https://app.dimensions.ai/details/organization/grid.168010.e",
    );
  });
});
