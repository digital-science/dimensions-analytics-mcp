/**
 * Pure helpers for MCP client config merge/verify (used by install.mjs).
 */
import { spawnSync } from "node:child_process";

export const DEFAULT_DIMENSIONS_BASE_URL = "https://app.dimensions.ai";

/**
 * @param {unknown} raw
 * @returns {string | undefined}
 */
export function normalizeDimensionsBaseUrl(raw) {
  if (raw == null) return undefined;
  let value = String(raw).trim();
  if (!value) return undefined;
  if (!/^https?:\/\//i.test(value)) {
    value = `https://${value}`;
  }
  return value.replace(/\/+$/, "");
}

/**
 * @param {string} apiKey
 * @param {unknown} [baseUrl]
 * @returns {Record<string, string>}
 */
export function buildServerEnv(apiKey, baseUrl) {
  const env = { DIMENSIONS_API_KEY: apiKey };
  const normalized = normalizeDimensionsBaseUrl(baseUrl);
  if (normalized && normalized !== DEFAULT_DIMENSIONS_BASE_URL) {
    env.DIMENSIONS_BASE_URL = normalized;
  }
  return env;
}

/**
 * @param {string} apiKey
 * @param {string} mainJs
 * @param {unknown} [baseUrl]
 * @returns {{ command: string, args: string[], env: Record<string, string> }}
 */
export function buildServerEntry(apiKey, mainJs, baseUrl) {
  return {
    command: "node",
    args: [mainJs],
    env: buildServerEnv(apiKey, baseUrl),
  };
}

/**
 * Clients that can connect to the hosted Streamable HTTP endpoint with a Bearer header.
 * Claude Desktop's config file only supports local (stdio) servers.
 */
export const HOSTED_CLIENTS = ["cursor", "vscode", "windsurf"];

/**
 * Hosted endpoint for a Dimensions instance, e.g. https://app.dimensions.ai/mcp.
 * @param {unknown} [baseUrl]
 * @returns {string}
 */
export function hostedMcpUrl(baseUrl) {
  return `${normalizeDimensionsBaseUrl(baseUrl) ?? DEFAULT_DIMENSIONS_BASE_URL}/mcp`;
}

/**
 * Remote MCP entry for a client. Each client spells the URL field differently.
 * @param {string} clientId
 * @param {string} apiKey
 * @param {string} url
 * @returns {Record<string, unknown>}
 */
export function buildHostedServerEntry(clientId, apiKey, url) {
  const headers = { Authorization: `Bearer ${apiKey}` };
  switch (clientId) {
    case "cursor":
      return { url, headers };
    case "vscode":
      return { type: "http", url, headers };
    case "windsurf":
      return { serverUrl: url, headers };
    default:
      throw new Error(`${clientId} does not support the hosted endpoint`);
  }
}

const INITIALIZE_REQUEST = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "dimensions-analytics-mcp-installer", version: "1" },
  },
};

/**
 * Checks the hosted endpoint with an MCP initialize request.
 * - "ok": endpoint is live and accepted the key
 * - "unauthorized": endpoint is live but rejected the key (or no key was given)
 * - "unavailable": no hosted endpoint on this instance (404, network error, ...)
 * @param {string} url
 * @param {string | undefined} apiKey
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<"ok" | "unauthorized" | "unavailable">}
 */
export async function probeHostedEndpoint(url, apiKey, fetchImpl = fetch) {
  /** @type {Record<string, string>} */
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  let response;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers,
      body: JSON.stringify(INITIALIZE_REQUEST),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return "unavailable";
  }
  if (response.status === 401 || response.status === 403) return "unauthorized";
  if (!response.ok) return "unavailable";
  // Close the session the probe opened; failures here do not matter.
  const sessionId = response.headers.get("mcp-session-id");
  if (sessionId) {
    await fetchImpl(url, {
      method: "DELETE",
      headers: { ...headers, "Mcp-Session-Id": sessionId },
      signal: AbortSignal.timeout(5_000),
    }).catch(() => {});
  }
  return "ok";
}

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
 * @param {{ command?: string, args?: string[], type?: string, url?: string, serverUrl?: string }} expected
 * @returns {boolean}
 */
export function hasServerEntry(doc, configKey, serverName, expected) {
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) return false;
  const servers = /** @type {Record<string, unknown>} */ (doc)[configKey];
  if (!servers || typeof servers !== "object" || Array.isArray(servers)) return false;
  const entry = /** @type {Record<string, unknown>} */ (servers)[serverName];
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return false;
  for (const key of /** @type {const} */ (["command", "type", "url", "serverUrl"])) {
    if (expected[key] != null && entry[key] !== expected[key]) return false;
  }
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
