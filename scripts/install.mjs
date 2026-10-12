#!/usr/bin/env node
/**
 * Interactive Dimensions Analytics MCP installer.
 * Installs @digital-science-dsl/dimensions-analytics-mcp from npm and configures MCP clients.
 */
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  createReadStream,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { homedir, platform } from "node:os";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { Readable } from "node:stream";
import {
  buildHostedServerEntry,
  buildServerEntry,
  HOSTED_CLIENTS,
  hasServerEntry,
  hostedMcpUrl,
  isClaudeDesktopRunning,
  mergeServerEntry,
  probeHostedEndpoint,
} from "./install-config.mjs";

const REPO = "digital-science/dimensions-analytics-mcp";
const REPO_URL = `https://github.com/${REPO}`;
const PACKAGE = "@digital-science-dsl/dimensions-analytics-mcp";
const PACKAGE_SCOPE = "@digital-science-dsl";
const PACKAGE_NAME = "dimensions-analytics-mcp";
const SERVER_NAME = "dimensions";
const MIN_NODE_MAJOR = 20;
const INSTALL_DIR = join(homedir(), ".dimensions-analytics-mcp");

const CLIENTS = {
  "claude-desktop": {
    label: "Claude Desktop",
    configKey: "mcpServers",
    requiresQuitBeforeWrite: true,
    configPath() {
      if (platform() === "win32") {
        const appData = process.env.APPDATA;
        if (!appData) throw new Error("APPDATA is not set");
        return join(appData, "Claude", "claude_desktop_config.json");
      }
      if (platform() === "darwin") {
        return join(
          homedir(),
          "Library",
          "Application Support",
          "Claude",
          "claude_desktop_config.json",
        );
      }
      return join(homedir(), ".config", "Claude", "claude_desktop_config.json");
    },
  },
  cursor: {
    label: "Cursor",
    configKey: "mcpServers",
    configPath() {
      return join(homedir(), ".cursor", "mcp.json");
    },
  },
  vscode: {
    label: "VS Code (GitHub Copilot MCP)",
    configKey: "servers",
    // User-profile config ("MCP: Open User Configuration"). ~/.vscode/mcp.json is only
    // read when the home directory itself is the open workspace.
    configPath() {
      if (platform() === "win32") {
        const appData = process.env.APPDATA;
        if (!appData) throw new Error("APPDATA is not set");
        return join(appData, "Code", "User", "mcp.json");
      }
      if (platform() === "darwin") {
        return join(homedir(), "Library", "Application Support", "Code", "User", "mcp.json");
      }
      return join(homedir(), ".config", "Code", "User", "mcp.json");
    },
  },
  windsurf: {
    label: "Windsurf",
    configKey: "mcpServers",
    configPath() {
      return join(homedir(), ".codeium", "windsurf", "mcp_config.json");
    },
  },
};

function parseArgs(argv) {
  const opts = {
    apiKey: process.env.DIMENSIONS_API_KEY,
    baseUrl: process.env.DIMENSIONS_BASE_URL,
    clients: null,
    mode: null,
    yes: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") opts.help = true;
    else if (arg === "--yes" || arg === "-y") opts.yes = true;
    else if (arg === "--api-key") opts.apiKey = argv[++i];
    else if (arg === "--base-url") opts.baseUrl = argv[++i];
    else if (arg === "--mode") opts.mode = argv[++i]?.trim().toLowerCase();
    else if (arg === "--clients") {
      opts.clients = argv[++i]
        ?.split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }
  return opts;
}

function printHelp() {
  console.log(`Dimensions Analytics MCP installer

One-line install (Mac / Linux):
  bash -c "$(curl -fsSL https://raw.githubusercontent.com/${REPO}/main/scripts/install.sh)"

One-line install (Windows PowerShell):
  irm https://raw.githubusercontent.com/${REPO}/main/scripts/install.ps1 | iex

From a git clone:
  ./scripts/install.sh
  .\\scripts\\install.ps1

Options:
  --api-key <key>           Dimensions API key (or DIMENSIONS_API_KEY env)
  --base-url <url>          Custom instance URL (or DIMENSIONS_BASE_URL env)
  --clients <list>          Comma-separated: claude-desktop,cursor,vscode,windsurf
  --mode <local|hosted>     local (default): run the server on this machine.
                            hosted: connect ${HOSTED_CLIENTS.join(", ")} to the hosted
                            endpoint (<instance>/mcp) instead. Claude Desktop always
                            uses the local server.
  --yes, -y                 Skip confirmation prompts
  --help, -h                Show this help

npm package: ${PACKAGE} (public registry — no GitHub token required)
Repository: ${REPO_URL}
Supported clients: ${Object.keys(CLIENTS).join(", ")}
`);
}

function assertNodeVersion() {
  const major = Number.parseInt(process.versions.node.split(".")[0], 10);
  if (major < MIN_NODE_MAJOR) {
    console.error(`Node.js ${MIN_NODE_MAJOR}+ is required. You have ${process.version}.`);
    process.exit(1);
  }
  if (spawnSync("npm", ["--version"], { shell: platform() === "win32" }).status !== 0) {
    console.error("npm is required but was not found. Reinstall Node.js from https://nodejs.org/");
    process.exit(1);
  }
}

let interactiveInput = null;

function getInteractiveInput() {
  if (interactiveInput) {
    return interactiveInput;
  }
  if (process.stdin.isTTY) {
    interactiveInput = process.stdin;
    return interactiveInput;
  }
  if (platform() === "win32") {
    try {
      interactiveInput = createReadStream("CONIN$");
      return interactiveInput;
    } catch {
      return null;
    }
  }
  try {
    const fd = openSync("/dev/tty", "r");
    interactiveInput = createReadStream(null, { fd });
    return interactiveInput;
  } catch {
    return null;
  }
}

function createPrompt({ yes = false } = {}) {
  let input = getInteractiveInput();
  // --yes needs no answers, so it also works without a terminal (CI, scripts).
  if (!input && yes) input = Readable.from([]);
  if (!input) {
    console.error(`Non-interactive stdin. Re-run from a terminal, or use:
  node install.mjs --yes --api-key <key> --clients claude-desktop,cursor
  (add --base-url for a custom Dimensions instance)
One-line install: bash -c "$(curl -fsSL .../install.sh)"`);
    process.exit(1);
  }
  return createInterface({
    input,
    output: process.stdout,
  });
}

function ask(rl, question, { defaultValue = "", secret = false } = {}) {
  const suffix = defaultValue ? ` [${defaultValue}]` : "";
  const input = getInteractiveInput() ?? process.stdin;
  return new Promise((resolve) => {
    if (secret && input.isTTY && input.setRawMode) {
      process.stdout.write(`${question}${suffix}: `);
      let value = "";
      const onData = (chunk) => {
        const text = chunk.toString();
        for (const char of text) {
          const code = char.charCodeAt(0);
          if (code === 13 || code === 10) {
            input.off("data", onData);
            input.setRawMode(false);
            process.stdout.write("\n");
            resolve(value || defaultValue);
            return;
          }
          if (code === 127 || code === 8) {
            value = value.slice(0, -1);
            continue;
          }
          if (code >= 32) value += char;
        }
      };
      try {
        input.setRawMode(true);
        input.resume();
        input.on("data", onData);
        return;
      } catch {
        process.stdout.write("(input visible)\n");
      }
    }
    rl.question(`${question}${suffix}: `, (answer) => {
      resolve(answer.trim() || defaultValue);
    });
  });
}

async function promptApiKey(rl, opts) {
  let apiKey = opts.apiKey;
  if (!apiKey) {
    console.log(`
Use the same Dimensions API key as the Dimensions DSL API.
Find it in your Dimensions account settings.
`);
    apiKey = await ask(rl, "Dimensions API key", { secret: true });
  }
  if (!apiKey) {
    console.error("Dimensions API key is required.");
    process.exit(1);
  }
  return apiKey;
}

async function promptBaseUrl(rl, opts) {
  if (opts.baseUrl) return opts.baseUrl;
  if (opts.yes) return "";
  console.log(`
Custom Dimensions instance?
If you log in at a URL other than app.dimensions.ai (for example your-instance.dimensions.ai),
enter that URL. Press Enter to use the standard instance.
`);
  return ask(rl, "Dimensions instance URL (optional)");
}

async function promptClients(rl, opts) {
  if (opts.clients?.length) {
    const invalid = opts.clients.filter((id) => !CLIENTS[id]);
    if (invalid.length) {
      console.error(`Unknown client(s): ${invalid.join(", ")}`);
      process.exit(1);
    }
    return opts.clients;
  }

  console.log(`
Which AI apps should we configure?
  1) Claude Desktop
  2) Cursor
  3) VS Code (Copilot MCP)
  4) Windsurf
  5) All of the above
`);
  const answer = await ask(rl, "Enter numbers (e.g. 1,3) or press Enter for Claude Desktop", {
    defaultValue: "1",
  });

  const picks = new Set(
    answer
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter(Boolean),
  );
  if (picks.has("5")) {
    return Object.keys(CLIENTS);
  }

  const map = {
    1: "claude-desktop",
    2: "cursor",
    3: "vscode",
    4: "windsurf",
  };
  const selected = [...picks].map((n) => map[n]).filter(Boolean);
  return selected.length ? selected : ["claude-desktop"];
}

async function promptMode(rl, opts, clientIds, baseUrl) {
  if (opts.mode != null && opts.mode !== "local" && opts.mode !== "hosted") {
    console.error(`Unknown --mode "${opts.mode}". Use local or hosted.`);
    process.exit(1);
  }
  if (opts.mode === "local") return "local";

  const hostedCapable = clientIds.filter((id) => HOSTED_CLIENTS.includes(id));
  if (!hostedCapable.length) {
    if (opts.mode === "hosted") {
      console.log(
        `\nHosted mode applies to ${HOSTED_CLIENTS.map((id) => CLIENTS[id].label).join(", ")}; ` +
          "the selected apps will use the local server.",
      );
    }
    return "local";
  }
  if (opts.mode === "hosted") return "hosted";
  if (opts.yes) return "local";

  const url = hostedMcpUrl(baseUrl);
  if ((await probeHostedEndpoint(url)) === "unavailable") return "local";

  console.log(`
How should ${hostedCapable.map((id) => CLIENTS[id].label).join(", ")} connect?
  1) Local server — installed on this computer and kept up to date automatically.
     Supports every tool, including fetch_search_pages exports to local files.
  2) Hosted — connect to ${url}. Nothing is installed or updated locally;
     fetch_search_pages is not available.
${clientIds.includes("claude-desktop") ? "Claude Desktop always uses the local server.\n" : ""}`);
  const answer = await ask(rl, "Enter 1 or 2", { defaultValue: "1" });
  return answer.trim() === "2" ? "hosted" : "local";
}

async function verifyHostedKey(url, apiKey) {
  console.log(`\nChecking your API key against ${url} ...`);
  const status = await probeHostedEndpoint(url, apiKey);
  if (status === "ok") {
    console.log("  API key accepted.");
    return;
  }
  if (status === "unauthorized") {
    console.error(`The hosted endpoint rejected your API key.
Check the key, and that it belongs to this Dimensions instance (a key from a custom
instance only works there). Your account needs Analytics API access.`);
  } else {
    console.error(`No hosted endpoint is available at ${url}.
Re-run the installer with the local server (--mode local).`);
  }
  process.exit(1);
}

function runNpmInstall() {
  mkdirSync(INSTALL_DIR, { recursive: true });
  console.log(`\nInstalling ${PACKAGE} from npm to ${INSTALL_DIR} ...`);
  const result = spawnSync(
    "npm",
    [
      "install",
      PACKAGE,
      "--prefix",
      INSTALL_DIR,
      "--registry",
      "https://registry.npmjs.org",
      "--no-fund",
      "--no-audit",
    ],
    { stdio: "inherit", shell: platform() === "win32" },
  );
  if (result.status !== 0) {
    console.error("npm install failed.");
    process.exit(result.status ?? 1);
  }
}

function resolveMainJs() {
  const mainJs = join(INSTALL_DIR, "node_modules", PACKAGE_SCOPE, PACKAGE_NAME, "dist", "main.js");
  if (!existsSync(mainJs)) {
    console.error(`Could not find installed server at ${mainJs}`);
    process.exit(1);
  }
  return mainJs;
}

function readJson(path) {
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    console.error(`Could not parse JSON: ${path}`);
    process.exit(1);
  }
}

function writeJson(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function backupFile(path) {
  if (!existsSync(path)) return;
  const backup = `${path}.backup-${Date.now()}`;
  copyFileSync(path, backup);
  console.log(`  Backup: ${backup}`);
}

async function waitForClaudeDesktopQuit(rl, { nonInteractive = false } = {}) {
  if (!isClaudeDesktopRunning()) return;

  const configPath = CLIENTS["claude-desktop"].configPath();
  const quitHint =
    platform() === "win32"
      ? "Right-click the Claude tray icon → Exit (closing the window is not enough)."
      : "Quit Claude completely with Cmd+Q / Claude menu → Quit (closing the window is not enough).";

  if (nonInteractive) {
    console.error(`
Claude Desktop is still running. It will overwrite ${configPath}
from its in-memory config and drop any MCP entries the installer writes.

${quitHint}
Then re-run this installer (or run without --yes so it can wait for you to quit).
`);
    process.exit(1);
  }

  console.log(`
Claude Desktop is still running. It will overwrite ${configPath}
from its in-memory config and drop any MCP entries the installer writes.

${quitHint}
`);

  while (isClaudeDesktopRunning()) {
    await ask(rl, "Quit Claude Desktop, then press Enter to continue (Ctrl+C to cancel)");
    if (isClaudeDesktopRunning()) {
      console.log("Claude Desktop is still running. Close it completely, then try again.\n");
    }
  }
  console.log("  Claude Desktop quit — continuing.\n");
}

async function configureClient(rl, clientId, entry, { nonInteractive = false } = {}) {
  const client = CLIENTS[clientId];
  const configPath = client.configPath();
  if (client.requiresQuitBeforeWrite) {
    await waitForClaudeDesktopQuit(rl, { nonInteractive });
  }

  let doc;
  try {
    doc = mergeServerEntry(readJson(configPath), client.configKey, SERVER_NAME, entry);
  } catch (err) {
    console.error(`${client.label}: ${err instanceof Error ? err.message : err}`);
    console.error(`  Config file: ${configPath}`);
    process.exit(1);
  }

  backupFile(configPath);
  writeJson(configPath, doc);

  const written = readJson(configPath);
  if (!hasServerEntry(written, client.configKey, SERVER_NAME, entry)) {
    console.error(`
${client.label}: wrote ${configPath}, but "${SERVER_NAME}" is missing after write.
If Claude Desktop was open, quit it completely and re-run the installer.
`);
    process.exit(1);
  }

  console.log(`  ${client.label}: ${configPath}`);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    printHelp();
    return;
  }

  assertNodeVersion();

  const rl = createPrompt(opts);
  console.log("Dimensions Analytics MCP — setup wizard\n");
  try {
    const apiKey = await promptApiKey(rl, opts);
    const baseUrl = await promptBaseUrl(rl, opts);
    const clientIds = await promptClients(rl, opts);
    const mode = await promptMode(rl, opts, clientIds, baseUrl);
    const hostedUrl = hostedMcpUrl(baseUrl);
    const isHosted = (id) => mode === "hosted" && HOSTED_CLIENTS.includes(id);
    if (mode === "hosted") {
      await verifyHostedKey(hostedUrl, apiKey);
    }

    if (!opts.yes) {
      const labels = clientIds.map(
        (id) => `${CLIENTS[id].label} (${isHosted(id) ? "hosted" : "local"})`,
      );
      const confirm = await ask(rl, `Configure ${labels.join(", ")}?`, { defaultValue: "y" });
      if (!/^y(es)?$/i.test(confirm)) {
        console.log("Cancelled.");
        return;
      }
    }

    const needsLocal = clientIds.some((id) => !isHosted(id));
    let mainJs = null;
    if (needsLocal) {
      runNpmInstall();
      mainJs = resolveMainJs();
    }

    console.log("\nConfiguring MCP clients...");
    for (const clientId of clientIds) {
      const entry = isHosted(clientId)
        ? buildHostedServerEntry(clientId, apiKey, hostedUrl)
        : buildServerEntry(apiKey, mainJs, baseUrl);
      await configureClient(rl, clientId, entry, { nonInteractive: opts.yes });
    }

    console.log(`
Done!

Next steps:
  1. Open (or reopen) each configured app so it reloads MCP config.
     For Claude Desktop: open Chat (not Cowork) and look for "dimensions".
  2. Look for "dimensions" in the app's MCP / integrations list.
  3. Try a prompt — ${REPO_URL}/blob/main/docs/USAGE.md
`);
    if (mode === "hosted") {
      console.log(`Hosted apps connect to ${hostedUrl} — nothing to update on this computer.
`);
    }
    if (needsLocal) {
      console.log(`The local server checks npm about once a day and applies same-major updates automatically.
To force an update, run this installer again. To disable auto-install, set
DIMENSIONS_MCP_AUTO_UPDATE=0 in the MCP env. If a newer version cannot be applied,
the server logs a warning with upgrade steps.

Installed server: ${mainJs}
`);
    }
  } finally {
    rl.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
