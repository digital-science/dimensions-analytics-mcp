import { describe, expect, it } from "vitest";
import { hasServerEntry, isClaudeDesktopRunning, mergeServerEntry } from "./install-config.mjs";

const entry = {
  command: "node",
  args: ["/tmp/main.js"],
  env: { DIMENSIONS_API_KEY: "secret" },
};

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
