/**
 * Pure helpers for MCP client config merge/verify (used by install.mjs).
 */
import { spawnSync } from "node:child_process";

/**
 * @param {Record<string, unknown>} doc
 * @param {string} configKey
 * @param {string} serverName
 * @param {Record<string, unknown>} entry
 * @returns {Record<string, unknown>}
 */
export function mergeServerEntry(doc, configKey, serverName, entry) {
  const existing = doc[configKey];
  if (existing == null) {
    doc[configKey] = {};
  } else if (
    typeof existing !== "object" ||
    Array.isArray(existing) ||
    Object.getPrototypeOf(existing) !== Object.prototype
  ) {
    throw new Error(
      `"${configKey}" must be a JSON object (got ${Array.isArray(existing) ? "array" : typeof existing}). Fix the config file, then re-run the installer.`,
    );
  }
  /** @type {Record<string, unknown>} */ (doc[configKey])[serverName] = entry;
  return doc;
}

/**
 * @param {unknown} doc
 * @param {string} configKey
 * @param {string} serverName
 * @param {{ command?: string, args?: string[] }} expected
 * @returns {boolean}
 */
export function hasServerEntry(doc, configKey, serverName, expected) {
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) return false;
  const servers = /** @type {Record<string, unknown>} */ (doc)[configKey];
  if (!servers || typeof servers !== "object" || Array.isArray(servers)) return false;
  const entry = /** @type {Record<string, unknown>} */ (servers)[serverName];
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return false;
  if (expected.command != null && entry.command !== expected.command) return false;
  if (expected.args != null) {
    if (!Array.isArray(entry.args)) return false;
    if (JSON.stringify(entry.args) !== JSON.stringify(expected.args)) return false;
  }
  return true;
}

/**
 * Best-effort check whether Claude Desktop is running.
 * @param {() => NodeJS.Platform | string} [getPlatform]
 * @param {(cmd: string, args: string[], opts?: object) => { status: number | null, stdout?: Buffer | string }} [spawn]
 * @returns {boolean}
 */
export function isClaudeDesktopRunning(getPlatform = () => process.platform, spawn = spawnSync) {
  const os = getPlatform();
  if (os === "win32") {
    const result = spawn("tasklist", ["/FI", "IMAGENAME eq Claude.exe", "/NH"], {
      encoding: "utf8",
      shell: true,
    });
    const out = String(result.stdout ?? "");
    return /Claude\.exe/i.test(out);
  }
  // macOS/Linux: process name is "Claude"; -x avoids substring matches.
  const result = spawn("pgrep", ["-x", "Claude"], { encoding: "utf8" });
  return result.status === 0;
}
