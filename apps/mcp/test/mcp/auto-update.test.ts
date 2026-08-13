/**
 * @module test/mcp/auto-update
 */

import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type AutoUpdateIo,
  DEFAULT_UPDATE_INTERVAL_MS,
  detectInstallLayout,
  envFlagOff,
  type InstallLayout,
  NPM_PACKAGE,
  PREFIX_DIR_NAME,
  parseSemver,
  readCurrentVersion,
  resolveNpmBin,
  resolvePackageRoot,
  runUpdateCheck,
  stampPathFor,
  UPDATING_DOCS_URL,
  type UpdateStamp,
  upgradeGuidance,
  upgradeRecipe,
  versionRelation,
} from "../../src/mcp/auto-update.js";

const HOME = "/Users/test";
const PREFIX_ROOT = join(
  HOME,
  PREFIX_DIR_NAME,
  "node_modules",
  "@digital-science-dsl",
  "dimensions-analytics-mcp",
);

function fakeIo(overrides: Partial<AutoUpdateIo> & { stamps?: Map<string, UpdateStamp> } = {}): {
  io: AutoUpdateIo;
  logs: string[];
  stamps: Map<string, UpdateStamp>;
  reexec: ReturnType<typeof vi.fn>;
  npmInstall: ReturnType<typeof vi.fn>;
} {
  const logs: string[] = [];
  const stamps = overrides.stamps ?? new Map<string, UpdateStamp>();
  const reexec = vi.fn();
  const npmInstall = vi.fn<(version: string) => boolean>().mockReturnValue(true);
  const stampPath = join(HOME, PREFIX_DIR_NAME, ".auto-update.json");

  const io: AutoUpdateIo = {
    now: () => 1_000_000,
    env: {},
    layout: "prefix",
    currentVersion: "1.2.0",
    allowInstall: true,
    stampPath,
    readStamp: (path) => stamps.get(path),
    writeStamp: (path, stamp) => {
      stamps.set(path, stamp);
    },
    npmView: () => "1.3.0",
    npmInstall,
    log: (message) => {
      logs.push(message);
    },
    reexec,
    ...overrides,
  };

  return { io, logs, stamps, reexec, npmInstall };
}

describe("envFlagOff", () => {
  it("treats 0/false/off/no as off", () => {
    expect(envFlagOff("0")).toBe(true);
    expect(envFlagOff("false")).toBe(true);
    expect(envFlagOff("OFF")).toBe(true);
    expect(envFlagOff("no")).toBe(true);
    expect(envFlagOff("1")).toBe(false);
    expect(envFlagOff(undefined)).toBe(false);
  });
});

describe("detectInstallLayout", () => {
  it("detects the guided prefix install", () => {
    expect(detectInstallLayout(PREFIX_ROOT, HOME)).toBe("prefix");
    expect(detectInstallLayout(`${PREFIX_ROOT}/dist`, HOME)).toBe("prefix");
  });

  it("detects npx cache paths", () => {
    expect(
      detectInstallLayout(
        "/Users/test/.npm/_npx/abc123/node_modules/@digital-science-dsl/dimensions-analytics-mcp",
        HOME,
      ),
    ).toBe("npx");
  });

  it("detects global installs", () => {
    expect(
      detectInstallLayout(
        "/usr/local/lib/node_modules/@digital-science-dsl/dimensions-analytics-mcp",
        HOME,
      ),
    ).toBe("global");
  });

  it("detects source / workspace checkouts", () => {
    expect(
      detectInstallLayout("/Users/akovari/devel/dimensions-analytics-mcp/apps/mcp", HOME),
    ).toBe("source");
  });

  it("normalizes Windows prefix paths", () => {
    expect(
      detectInstallLayout(
        "C:\\Users\\test\\.dimensions-analytics-mcp\\node_modules\\@digital-science-dsl\\dimensions-analytics-mcp",
        "C:\\Users\\test",
      ),
    ).toBe("prefix");
  });
});

describe("versionRelation", () => {
  it("classifies same, patch/minor, and major", () => {
    expect(versionRelation("1.2.0", "1.2.0")).toBe("same");
    expect(versionRelation("1.2.0", "1.2.1")).toBe("newer-same-major");
    expect(versionRelation("1.2.0", "1.3.0")).toBe("newer-same-major");
    expect(versionRelation("1.2.0", "2.0.0")).toBe("newer-major");
    expect(versionRelation("1.3.0", "1.2.0")).toBe("older");
    expect(versionRelation("nope", "1.0.0")).toBe("incomparable");
  });
});

describe("parseSemver", () => {
  it("reads leading v and ignores pre-release suffix for the numeric core", () => {
    expect(parseSemver("v1.2.3")).toEqual({ major: 1, minor: 2, patch: 3 });
    expect(parseSemver("1.2.3-beta.1")).toEqual({ major: 1, minor: 2, patch: 3 });
  });
});

describe("upgradeGuidance", () => {
  const layouts: InstallLayout[] = ["prefix", "npx", "global", "source", "hosted"];

  it.each(layouts)("includes docs link and a recipe for %s", (layout) => {
    const text = upgradeGuidance(layout, "1.0.3", "1.3.0");
    expect(text).toContain("1.0.3");
    expect(text).toContain("1.3.0");
    expect(text).toContain(UPDATING_DOCS_URL);
    expect(text).toContain(upgradeRecipe(layout).split("\n")[0]);
  });

  it("tells prefix users to re-run the installer or npm --prefix", () => {
    const text = upgradeGuidance("prefix", "1.0.3", "1.3.0");
    expect(text).toContain("install.sh");
    expect(text).toContain("install.ps1");
    expect(text).toContain(`npm install ${NPM_PACKAGE}@latest --prefix ~/${PREFIX_DIR_NAME}`);
  });

  it("tells npx users to pin @latest", () => {
    expect(upgradeGuidance("npx", "1.0.3", "1.3.0")).toContain(`${NPM_PACKAGE}@latest`);
    expect(upgradeGuidance("npx", "1.0.3", "1.3.0")).toContain("npx cache");
  });

  it("tells global users to npm install -g @latest", () => {
    expect(upgradeGuidance("global", "1.0.3", "1.3.0")).toContain(
      `npm install -g ${NPM_PACKAGE}@latest`,
    );
  });

  it("tells source checkouts to pull and rebuild", () => {
    expect(upgradeGuidance("source", "1.0.3", "1.3.0")).toContain(
      "git pull && pnpm install && pnpm run build",
    );
  });

  it("tells hosted operators to bump the pin, not run the stdio installer", () => {
    const text = upgradeGuidance("hosted", "1.0.3", "1.3.0");
    expect(text).toContain("deployed image");
    expect(text).toContain("Do not run the stdio installer");
  });

  it("notes that majors are not auto-applied", () => {
    expect(upgradeGuidance("prefix", "1.2.0", "2.0.0", { major: true })).toContain(
      "auto-update will not apply it",
    );
  });
});

describe("stampPathFor", () => {
  it("uses the prefix dir for stdio and tmpdir for hosted", () => {
    expect(stampPathFor("prefix", HOME, "/tmp")).toBe(
      join(HOME, PREFIX_DIR_NAME, ".auto-update.json"),
    );
    expect(stampPathFor("hosted", HOME, "/tmp")).toBe(
      "/tmp/dimensions-analytics-mcp-auto-update.json",
    );
  });
});

describe("resolveNpmBin", () => {
  it("prefers npm next to node", () => {
    expect(resolveNpmBin("/usr/local/bin/node", "darwin", (p) => p === "/usr/local/bin/npm")).toBe(
      "/usr/local/bin/npm",
    );
  });

  it("falls back to npm.cmd on Windows", () => {
    expect(resolveNpmBin("C:\\Program Files\\nodejs\\node.exe", "win32", () => false)).toBe(
      "npm.cmd",
    );
  });
});

describe("resolvePackageRoot / readCurrentVersion", () => {
  it("reads this workspace package version from import.meta.url", () => {
    const root = resolvePackageRoot();
    expect(readCurrentVersion(root)).toMatch(/^\d+\.\d+\.\d+/);
  });
});

describe("runUpdateCheck", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("skips when DIMENSIONS_MCP_UPDATED=1", () => {
    const { io, logs, stamps } = fakeIo({ env: { DIMENSIONS_MCP_UPDATED: "1" } });
    expect(runUpdateCheck(io)).toBe("skipped");
    expect(logs).toEqual([]);
    expect(stamps.size).toBe(0);
  });

  it("skips when DIMENSIONS_MCP_UPDATE_CHECK is off", () => {
    const { io, logs } = fakeIo({ env: { DIMENSIONS_MCP_UPDATE_CHECK: "0" } });
    expect(runUpdateCheck(io)).toBe("skipped");
    expect(logs).toEqual([]);
  });

  it("skips when the stamp is still fresh", () => {
    const stampPath = join(HOME, PREFIX_DIR_NAME, ".auto-update.json");
    const { io, logs } = fakeIo({
      now: () => 50_000,
      stamps: new Map([[stampPath, { checkedAt: 40_000 }]]),
      env: { DIMENSIONS_MCP_AUTO_UPDATE_INTERVAL_MS: String(DEFAULT_UPDATE_INTERVAL_MS) },
    });
    expect(runUpdateCheck(io)).toBe("skipped");
    expect(logs).toEqual([]);
  });

  it("does not warn when npm view fails", () => {
    const { io, logs, stamps } = fakeIo({ npmView: () => undefined });
    expect(runUpdateCheck(io)).toBe("current");
    expect(logs).toEqual([]);
    expect([...stamps.values()][0]?.skippedReason).toBe("view-failed");
  });

  it("does not warn when already on latest", () => {
    const { io, logs, reexec } = fakeIo({ npmView: () => "1.2.0", currentVersion: "1.2.0" });
    expect(runUpdateCheck(io)).toBe("current");
    expect(logs).toEqual([]);
    expect(reexec).not.toHaveBeenCalled();
  });

  it("installs and re-execs for prefix same-major updates", () => {
    const { io, logs, reexec, npmInstall, stamps } = fakeIo();
    expect(runUpdateCheck(io)).toBe("updated");
    expect(npmInstall).toHaveBeenCalledWith("1.3.0");
    expect(reexec).toHaveBeenCalledOnce();
    expect(logs).toEqual([]);
    expect([...stamps.values()][0]).toMatchObject({ from: "1.2.0", to: "1.3.0" });
  });

  it("writes the stamp before re-exec on success", () => {
    const order: string[] = [];
    const { io } = fakeIo({
      writeStamp: () => {
        order.push("stamp");
      },
      reexec: () => {
        order.push("reexec");
      },
    });
    runUpdateCheck(io);
    expect(order).toEqual(["stamp", "reexec"]);
  });

  it("warns and does not install when auto-update is disabled", () => {
    const { io, logs, reexec, npmInstall } = fakeIo({
      env: { DIMENSIONS_MCP_AUTO_UPDATE: "0" },
    });
    expect(runUpdateCheck(io)).toBe("warned");
    expect(npmInstall).not.toHaveBeenCalled();
    expect(reexec).not.toHaveBeenCalled();
    expect(logs[0]).toContain("install.sh");
  });

  it("warns on major versions and does not install", () => {
    const { io, logs, npmInstall, reexec } = fakeIo({ npmView: () => "2.0.0" });
    expect(runUpdateCheck(io)).toBe("warned");
    expect(npmInstall).not.toHaveBeenCalled();
    expect(reexec).not.toHaveBeenCalled();
    expect(logs[0]).toContain("auto-update will not apply it");
  });

  it("warns with the npx recipe and never installs", () => {
    const { io, logs, npmInstall, reexec } = fakeIo({ layout: "npx", allowInstall: true });
    expect(runUpdateCheck(io)).toBe("warned");
    expect(npmInstall).not.toHaveBeenCalled();
    expect(reexec).not.toHaveBeenCalled();
    expect(logs[0]).toContain("@latest");
    expect(logs[0]).toContain("npx cache");
  });

  it("warns with the global recipe", () => {
    const { io, logs, npmInstall } = fakeIo({ layout: "global" });
    expect(runUpdateCheck(io)).toBe("warned");
    expect(npmInstall).not.toHaveBeenCalled();
    expect(logs[0]).toContain("npm install -g");
  });

  it("warns with the source recipe", () => {
    const { io, logs, npmInstall } = fakeIo({ layout: "source" });
    expect(runUpdateCheck(io)).toBe("warned");
    expect(npmInstall).not.toHaveBeenCalled();
    expect(logs[0]).toContain("git pull && pnpm install && pnpm run build");
  });

  it("hosted layout never installs or re-execs", () => {
    const { io, logs, npmInstall, reexec } = fakeIo({
      layout: "hosted",
      allowInstall: false,
    });
    expect(runUpdateCheck(io)).toBe("warned");
    expect(npmInstall).not.toHaveBeenCalled();
    expect(reexec).not.toHaveBeenCalled();
    expect(logs[0]).toContain("deployed image");
  });

  it("warns when prefix install fails", () => {
    const { io, logs, reexec, npmInstall } = fakeIo();
    npmInstall.mockReturnValue(false);
    expect(runUpdateCheck(io)).toBe("warned");
    expect(reexec).not.toHaveBeenCalled();
    expect(logs[0]).toContain("Automatic update failed");
  });
});
