import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getMcpConfigForManifest } from "@anthropic-ai/mcpb";
import { describe, expect, it } from "vitest";
import { normalizeInstanceBaseUrl } from "../apps/mcp/src/mcp/profile-urls.js";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const manifest = JSON.parse(readFileSync(join(root, "mcpb/manifest.json"), "utf8"));

async function resolvedBaseUrl(userConfig: Record<string, string>): Promise<string> {
  const config = await getMcpConfigForManifest({
    manifest,
    extensionPath: "/ext",
    systemDirs: {},
    userConfig,
    pathSeparator: "/",
  });
  return normalizeInstanceBaseUrl(config?.env?.DIMENSIONS_BASE_URL);
}

// WEBAPPDEV-14080: the instance entered in Claude Desktop must reach the server.
describe("mcpb manifest base_url", () => {
  it("has no default that would mask the instance the user entered", () => {
    expect(manifest.user_config.base_url.default).toBeUndefined();
  });

  it.each([
    [{ api_key: "k" }, "https://app.dimensions.ai"],
    [{ api_key: "k", base_url: "" }, "https://app.dimensions.ai"],
    [{ api_key: "k", base_url: "trial.dimensions.ai" }, "https://trial.dimensions.ai"],
    [{ api_key: "k", base_url: "https://eu.dimensions.ai/" }, "https://eu.dimensions.ai"],
  ])("resolves %j to %s", async (userConfig, expected) => {
    expect(await resolvedBaseUrl(userConfig)).toBe(expected);
  });
});
