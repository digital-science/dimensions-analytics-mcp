import { describe, expect, it, vi } from "vitest";
import {
  buildHostedServerEntry,
  buildServerEntry,
  buildServerEnv,
  hasServerEntry,
  hostedMcpUrl,
  isClaudeDesktopRunning,
  mergeServerEntry,
  normalizeDimensionsBaseUrl,
  probeHostedEndpoint,
} from "./install-config.mjs";

const entry = {
  command: "node",
  args: ["/tmp/main.js"],
  env: { DIMENSIONS_API_KEY: "secret" },
};

describe("normalizeDimensionsBaseUrl", () => {
  it("returns undefined for blank input", () => {
    expect(normalizeDimensionsBaseUrl(undefined)).toBeUndefined();
    expect(normalizeDimensionsBaseUrl("")).toBeUndefined();
    expect(normalizeDimensionsBaseUrl("   ")).toBeUndefined();
  });

  it("adds https and strips a trailing slash", () => {
    expect(normalizeDimensionsBaseUrl("your-instance.dimensions.ai/")).toBe(
      "https://your-instance.dimensions.ai",
    );
  });

  it("keeps an explicit https URL", () => {
    expect(normalizeDimensionsBaseUrl("https://your-instance.dimensions.ai")).toBe(
      "https://your-instance.dimensions.ai",
    );
  });
});

describe("buildServerEnv", () => {
  it("includes only the API key for the standard instance", () => {
    expect(buildServerEnv("secret")).toEqual({ DIMENSIONS_API_KEY: "secret" });
    expect(buildServerEnv("secret", "")).toEqual({ DIMENSIONS_API_KEY: "secret" });
    expect(buildServerEnv("secret", "https://app.dimensions.ai")).toEqual({
      DIMENSIONS_API_KEY: "secret",
    });
  });

  it("adds DIMENSIONS_BASE_URL for a custom instance", () => {
    expect(buildServerEnv("secret", "https://your-instance.dimensions.ai")).toEqual({
      DIMENSIONS_API_KEY: "secret",
      DIMENSIONS_BASE_URL: "https://your-instance.dimensions.ai",
    });
  });
});

describe("buildServerEntry", () => {
  it("writes custom-instance env onto the MCP server entry", () => {
    expect(buildServerEntry("secret", "/tmp/main.js", "your-instance.dimensions.ai")).toEqual({
      command: "node",
      args: ["/tmp/main.js"],
      env: {
        DIMENSIONS_API_KEY: "secret",
        DIMENSIONS_BASE_URL: "https://your-instance.dimensions.ai",
      },
    });
  });
});

describe("mergeServerEntry", () => {
  it("creates mcpServers when missing", () => {
    const doc = mergeServerEntry({}, "mcpServers", "dimensions", entry);
    expect(doc).toEqual({ mcpServers: { dimensions: entry } });
  });

  it("preserves an existing sibling server", () => {
    const doc = mergeServerEntry(
      {
        mcpServers: {
          "cs-internal-mcp": { command: "node", args: ["other.js"] },
        },
      },
      "mcpServers",
      "dimensions",
      entry,
    );
    expect(doc.mcpServers).toEqual({
      "cs-internal-mcp": { command: "node", args: ["other.js"] },
      dimensions: entry,
    });
  });

  it("replaces an existing dimensions entry", () => {
    const doc = mergeServerEntry(
      {
        mcpServers: {
          dimensions: { command: "old", args: ["old.js"] },
        },
      },
      "mcpServers",
      "dimensions",
      entry,
    );
    expect(doc.mcpServers).toEqual({ dimensions: entry });
  });

  it("rejects a non-object mcpServers value", () => {
    expect(() => mergeServerEntry({ mcpServers: [] }, "mcpServers", "dimensions", entry)).toThrow(
      /must be a JSON object \(got array\)/,
    );
    expect(() =>
      mergeServerEntry({ mcpServers: "bad" }, "mcpServers", "dimensions", entry),
    ).toThrow(/must be a JSON object \(got string\)/);
  });
});

describe("hasServerEntry", () => {
  it("returns true when command and args match", () => {
    expect(
      hasServerEntry({ mcpServers: { dimensions: entry } }, "mcpServers", "dimensions", entry),
    ).toBe(true);
  });

  it("returns false when dimensions is missing or args differ", () => {
    expect(hasServerEntry({ mcpServers: {} }, "mcpServers", "dimensions", entry)).toBe(false);
    expect(
      hasServerEntry(
        {
          mcpServers: {
            dimensions: { command: "node", args: ["/other.js"] },
          },
        },
        "mcpServers",
        "dimensions",
        entry,
      ),
    ).toBe(false);
  });

  it("matches hosted entries by URL", () => {
    const hosted = buildHostedServerEntry("vscode", "secret", "https://app.dimensions.ai/mcp");
    expect(
      hasServerEntry({ servers: { dimensions: hosted } }, "servers", "dimensions", hosted),
    ).toBe(true);
    expect(
      hasServerEntry(
        { servers: { dimensions: { ...hosted, url: "https://other.example/mcp" } } },
        "servers",
        "dimensions",
        hosted,
      ),
    ).toBe(false);
  });
});

describe("hostedMcpUrl", () => {
  it("uses the standard instance by default", () => {
    expect(hostedMcpUrl()).toBe("https://app.dimensions.ai/mcp");
    expect(hostedMcpUrl("")).toBe("https://app.dimensions.ai/mcp");
  });

  it("uses a custom instance URL", () => {
    expect(hostedMcpUrl("your-instance.dimensions.ai/")).toBe(
      "https://your-instance.dimensions.ai/mcp",
    );
  });
});

describe("buildHostedServerEntry", () => {
  const url = "https://app.dimensions.ai/mcp";
  const headers = { Authorization: "Bearer secret" };

  it("uses each client's remote-server format", () => {
    expect(buildHostedServerEntry("cursor", "secret", url)).toEqual({ url, headers });
    expect(buildHostedServerEntry("vscode", "secret", url)).toEqual({ type: "http", url, headers });
    expect(buildHostedServerEntry("windsurf", "secret", url)).toEqual({ serverUrl: url, headers });
  });

  it("rejects Claude Desktop, which only supports local servers", () => {
    expect(() => buildHostedServerEntry("claude-desktop", "secret", url)).toThrow(
      /does not support the hosted endpoint/,
    );
  });
});

describe("probeHostedEndpoint", () => {
  const url = "https://app.dimensions.ai/mcp";
  const respond = (status: number, headers: Record<string, string> = {}) =>
    vi.fn().mockResolvedValue(new Response(null, { status, headers }));

  it("returns ok and closes the probe session when the key is accepted", async () => {
    const fetchImpl = respond(200, { "mcp-session-id": "abc" });
    expect(await probeHostedEndpoint(url, "secret", fetchImpl)).toBe("ok");
    const [, init] = fetchImpl.mock.calls[0];
    expect(init.headers.Authorization).toBe("Bearer secret");
    expect(fetchImpl.mock.calls[1][1]).toMatchObject({
      method: "DELETE",
      headers: { "Mcp-Session-Id": "abc" },
    });
  });

  it("returns unauthorized for 401 and sends no key when none is given", async () => {
    const fetchImpl = respond(401);
    expect(await probeHostedEndpoint(url, undefined, fetchImpl)).toBe("unauthorized");
    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBeUndefined();
  });

  it("returns unavailable for 404 and network errors", async () => {
    expect(await probeHostedEndpoint(url, "secret", respond(404))).toBe("unavailable");
    const failing = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    expect(await probeHostedEndpoint(url, "secret", failing)).toBe("unavailable");
  });
});

describe("isClaudeDesktopRunning", () => {
  it("detects Claude.exe on Windows via tasklist output", () => {
    const running = isClaudeDesktopRunning(
      () => "win32",
      () => ({
        status: 0,
        stdout: "Claude.exe                   123 Console                    1    100,000 K",
      }),
    );
    expect(running).toBe(true);
  });

  it("returns false on Windows when Claude.exe is absent", () => {
    const running = isClaudeDesktopRunning(
      () => "win32",
      () => ({
        status: 0,
        stdout: "INFO: No tasks are running which match the specified criteria.",
      }),
    );
    expect(running).toBe(false);
  });

  it("uses pgrep -x Claude on macOS/Linux", () => {
    let seen: { cmd: string; args: string[] } | null = null;
    const running = isClaudeDesktopRunning(
      () => "darwin",
      (cmd, args) => {
        seen = { cmd, args };
        return { status: 0, stdout: "1234\n" };
      },
    );
    expect(running).toBe(true);
    expect(seen).toEqual({ cmd: "pgrep", args: ["-x", "Claude"] });
  });

  it("returns false when pgrep finds no process", () => {
    const running = isClaudeDesktopRunning(
      () => "darwin",
      () => ({ status: 1, stdout: "" }),
    );
    expect(running).toBe(false);
  });
});
