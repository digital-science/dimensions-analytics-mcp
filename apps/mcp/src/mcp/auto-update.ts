/**
 * Best-effort version check and prefix-only auto-update for stdio installs.
 * @module mcp/auto-update
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const NPM_PACKAGE = "@digital-science-dsl/dimensions-analytics-mcp";
export const UPDATING_DOCS_URL =
  "https://github.com/digital-science/dimensions-analytics-mcp/blob/main/docs/INSTALLATION.md#updating";
export const DEFAULT_UPDATE_INTERVAL_MS = 86_400_000;
export const NPM_VIEW_TIMEOUT_MS = 3_000;
export const NPM_INSTALL_TIMEOUT_MS = 12_000;
export const PREFIX_DIR_NAME = ".dimensions-analytics-mcp";

const REGISTRY = "https://registry.npmjs.org";
const INSTALL_SH = `bash -c "$(curl -fsSL https://raw.githubusercontent.com/digital-science/dimensions-analytics-mcp/main/scripts/install.sh)"`;
const INSTALL_PS1 =
  "irm https://raw.githubusercontent.com/digital-science/dimensions-analytics-mcp/main/scripts/install.ps1 | iex";

export type InstallLayout = "prefix" | "npx" | "global" | "source" | "hosted";
export type VersionRelation =
  | "same"
  | "older"
  | "newer-same-major"
  | "newer-major"
  | "incomparable";
export type UpdateCheckResult = "skipped" | "current" | "warned" | "updated";

export interface UpdateStamp {
  readonly checkedAt: number;
  readonly from?: string;
  readonly to?: string;
  readonly skippedReason?: string;
}

export interface AutoUpdateIo {
  readonly now: () => number;
  readonly env: NodeJS.ProcessEnv;
  readonly layout: InstallLayout;
  readonly currentVersion: string;
  readonly allowInstall: boolean;
  readonly stampPath: string;
  readonly readStamp: (path: string) => UpdateStamp | undefined;
  readonly writeStamp: (path: string, stamp: UpdateStamp) => void;
  readonly npmView: () => string | undefined;
  readonly npmInstall: (version: string) => boolean;
  readonly log: (message: string) => void;
  readonly reexec: () => void;
}

export function envFlagOff(value: string | undefined): boolean {
  if (value == null) return false;
  return ["0", "false", "off", "no"].includes(value.trim().toLowerCase());
}

export function resolvePackageRoot(moduleUrl: string = import.meta.url): string {
  return join(dirname(fileURLToPath(moduleUrl)), "..", "..");
}

export function readCurrentVersion(packageRoot: string): string {
  const raw = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8")) as {
    version?: unknown;
  };
  if (typeof raw.version !== "string" || raw.version.length === 0) {
    throw new Error(`Missing version in ${join(packageRoot, "package.json")}`);
  }
  return raw.version;
}

export function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}

export function detectInstallLayout(
  packageRoot: string,
  homeDir: string,
): Exclude<InstallLayout, "hosted"> {
  const root = normalizePath(packageRoot);
  const prefixRoot = normalizePath(
    join(
      homeDir,
      PREFIX_DIR_NAME,
      "node_modules",
      "@digital-science-dsl",
      "dimensions-analytics-mcp",
    ),
  );
  if (root === prefixRoot || root.startsWith(`${prefixRoot}/`)) return "prefix";
  if (root.includes("/_npx/") || root.includes("/_npx")) return "npx";
  if (root.includes("/node_modules/@digital-science-dsl/dimensions-analytics-mcp")) return "global";
  return "source";
}

export function parseSemver(
  version: string,
): { major: number; minor: number; patch: number } | undefined {
  const match = version
    .trim()
    .replace(/^v/i, "")
    .match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return undefined;
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

export function versionRelation(current: string, latest: string): VersionRelation {
  const a = parseSemver(current);
  const b = parseSemver(latest);
  if (!a || !b) return "incomparable";
  if (a.major === b.major && a.minor === b.minor && a.patch === b.patch) return "same";
  const cmp =
    a.major !== b.major
      ? a.major - b.major
      : a.minor !== b.minor
        ? a.minor - b.minor
        : a.patch - b.patch;
  if (cmp > 0) return "older";
  if (b.major > a.major) return "newer-major";
  return "newer-same-major";
}

export function upgradeGuidance(
  layout: InstallLayout,
  current: string,
  latest: string,
  options: { major?: boolean; installFailed?: boolean } = {},
): string {
  const lines = [`Dimensions Analytics MCP ${current} is behind npm ${latest}.`];
  if (options.major) {
    lines.push("This is a new major version; auto-update will not apply it.");
  }
  if (options.installFailed) {
    lines.push("Automatic update failed; install the new version manually.");
  }
  lines.push(upgradeRecipe(layout));
  lines.push(`See ${UPDATING_DOCS_URL}`);
  return lines.join("\n");
}

export function upgradeRecipe(layout: InstallLayout): string {
  switch (layout) {
    case "prefix":
      return [
        "Update with the installer, then restart your AI app:",
        `  Mac/Linux: ${INSTALL_SH}`,
        `  Windows PowerShell: ${INSTALL_PS1}`,
        `  Or: npm install ${NPM_PACKAGE}@latest --prefix ~/${PREFIX_DIR_NAME}`,
      ].join("\n");
    case "npx":
      return [
        `Set MCP args to ["-y", "${NPM_PACKAGE}@latest"] (or clear the npx cache) and restart.`,
        "Without @latest, npx keeps the cached tarball.",
      ].join("\n");
    case "global":
      return `Run: npm install -g ${NPM_PACKAGE}@latest\nThen restart your AI app.`;
    case "source":
      return "Run: git pull && pnpm install && pnpm run build";
    case "hosted":
      return "Bump the deployed image / npm pin and redeploy. Do not run the stdio installer on the host.";
  }
}

export function resolveNpmBin(
  execPath: string = process.execPath,
  platform: NodeJS.Platform = process.platform,
  exists: (path: string) => boolean = existsSync,
): string {
  const dir = dirname(execPath);
  const names = platform === "win32" ? ["npm.cmd", "npm.exe", "npm"] : ["npm"];
  for (const name of names) {
    const candidate = join(dir, name);
    if (exists(candidate)) return candidate;
  }
  return platform === "win32" ? "npm.cmd" : "npm";
}

export function stampPathFor(layout: InstallLayout, homeDir: string, tmpDir: string): string {
  if (layout === "hosted") {
    return join(tmpDir, "dimensions-analytics-mcp-auto-update.json");
  }
  return join(homeDir, PREFIX_DIR_NAME, ".auto-update.json");
}

export function readStampFile(path: string): UpdateStamp | undefined {
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as Partial<UpdateStamp>;
    if (typeof raw.checkedAt !== "number") return undefined;
    return {
      checkedAt: raw.checkedAt,
      ...(typeof raw.from === "string" ? { from: raw.from } : {}),
      ...(typeof raw.to === "string" ? { to: raw.to } : {}),
      ...(typeof raw.skippedReason === "string" ? { skippedReason: raw.skippedReason } : {}),
    };
  } catch {
    return undefined;
  }
}

export function writeStampFile(path: string, stamp: UpdateStamp): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(stamp)}\n`, "utf8");
}

function updateIntervalMs(env: NodeJS.ProcessEnv): number {
  const raw = env.DIMENSIONS_MCP_AUTO_UPDATE_INTERVAL_MS;
  if (raw == null || raw.trim() === "") return DEFAULT_UPDATE_INTERVAL_MS;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_UPDATE_INTERVAL_MS;
}

export function runUpdateCheck(io: AutoUpdateIo): UpdateCheckResult {
  if (io.env.DIMENSIONS_MCP_UPDATED === "1") return "skipped";
  if (envFlagOff(io.env.DIMENSIONS_MCP_UPDATE_CHECK)) return "skipped";

  const stamp = io.readStamp(io.stampPath);
  if (stamp && io.now() - stamp.checkedAt < updateIntervalMs(io.env)) {
    return "skipped";
  }

  const latest = io.npmView();
  if (latest == null) {
    io.writeStamp(io.stampPath, {
      checkedAt: io.now(),
      from: io.currentVersion,
      skippedReason: "view-failed",
    });
    return "current";
  }

  const relation = versionRelation(io.currentVersion, latest);
  if (relation === "same" || relation === "older" || relation === "incomparable") {
    io.writeStamp(io.stampPath, { checkedAt: io.now(), from: io.currentVersion, to: latest });
    return "current";
  }

  const canInstall =
    io.allowInstall &&
    io.layout === "prefix" &&
    !envFlagOff(io.env.DIMENSIONS_MCP_AUTO_UPDATE) &&
    relation === "newer-same-major";

  if (canInstall) {
    const ok = io.npmInstall(latest);
    if (ok) {
      io.writeStamp(io.stampPath, { checkedAt: io.now(), from: io.currentVersion, to: latest });
      io.reexec();
      return "updated";
    }
    io.log(
      upgradeGuidance(io.layout, io.currentVersion, latest, {
        installFailed: true,
        major: false,
      }),
    );
    io.writeStamp(io.stampPath, {
      checkedAt: io.now(),
      from: io.currentVersion,
      to: latest,
      skippedReason: "install-failed",
    });
    return "warned";
  }

  io.log(
    upgradeGuidance(io.layout, io.currentVersion, latest, {
      major: relation === "newer-major",
    }),
  );
  io.writeStamp(io.stampPath, {
    checkedAt: io.now(),
    from: io.currentVersion,
    to: latest,
    skippedReason: relation === "newer-major" ? "major" : "manual",
  });
  return "warned";
}

function spawnNpm(
  args: string[],
  timeout: number,
): { status: number | null; stdout: string; stderr: string } {
  const npmBin = resolveNpmBin();
  const result = spawnSync(npmBin, args, {
    encoding: "utf8",
    timeout,
    windowsHide: true,
    shell: process.platform === "win32",
  });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function npmViewLatest(): string | undefined {
  const result = spawnNpm(
    ["view", NPM_PACKAGE, "version", "--registry", REGISTRY],
    NPM_VIEW_TIMEOUT_MS,
  );
  if (result.status !== 0) return undefined;
  const version = result.stdout.trim().replace(/^"+|"+$/g, "");
  return parseSemver(version) ? version : undefined;
}

function npmInstallVersion(version: string, prefix: string): boolean {
  const result = spawnNpm(
    [
      "install",
      `${NPM_PACKAGE}@${version}`,
      "--prefix",
      prefix,
      "--registry",
      REGISTRY,
      "--no-fund",
      "--no-audit",
    ],
    NPM_INSTALL_TIMEOUT_MS,
  );
  return result.status === 0;
}

function reexecCurrentProcess(): void {
  const result = spawnSync(process.execPath, process.argv.slice(1), {
    env: { ...process.env, DIMENSIONS_MCP_UPDATED: "1" },
    stdio: "inherit",
    windowsHide: true,
  });
  process.exit(result.status ?? 1);
}

function createIo(options: { allowInstall: boolean; layout?: InstallLayout }): AutoUpdateIo {
  const home = homedir();
  const packageRoot = resolvePackageRoot();
  const layout = options.layout ?? detectInstallLayout(packageRoot, home);
  const prefix = join(home, PREFIX_DIR_NAME);
  return {
    now: () => Date.now(),
    env: process.env,
    layout,
    currentVersion: readCurrentVersion(packageRoot),
    allowInstall: options.allowInstall,
    stampPath: stampPathFor(layout, home, tmpdir()),
    readStamp: readStampFile,
    writeStamp: writeStampFile,
    npmView: npmViewLatest,
    npmInstall: (version) => npmInstallVersion(version, prefix),
    log: (message) => console.error(message),
    reexec: reexecCurrentProcess,
  };
}

/**
 * Stdio entry: may install + re-exec for prefix layouts.
 */
export function maybeAutoUpdateAndReexec(): void {
  try {
    runUpdateCheck(createIo({ allowInstall: true }));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Dimensions Analytics MCP update check failed: ${message}`);
  }
}

/**
 * Hosted HTTP entry: version warning only, never install or re-exec.
 */
export function maybeWarnStaleHostedVersion(): void {
  try {
    runUpdateCheck(createIo({ allowInstall: false, layout: "hosted" }));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Dimensions Analytics MCP update check failed: ${message}`);
  }
}
