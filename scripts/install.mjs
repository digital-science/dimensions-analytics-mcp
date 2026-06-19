#!/usr/bin/env node
/**
 * Interactive Dimensions Analytics MCP installer.
 * Installs @digital-science-dsl/dimensions-analytics-mcp from npm and configures MCP clients.
 */
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";

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
    configPath() {
      return join(homedir(), ".vscode", "mcp.json");
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
    clients: null,
    yes: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") opts.help = true;
    else if (arg === "--yes" || arg === "-y") opts.yes = true;
    else if (arg === "--api-key") opts.apiKey = argv[++i];
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
  curl -fsSL https://raw.githubusercontent.com/${REPO}/main/scripts/install.sh | bash

One-line install (Windows PowerShell):
  irm https://raw.githubusercontent.com/${REPO}/main/scripts/install.ps1 | iex

From a git clone:
  ./scripts/install.sh
  .\\scripts\\install.ps1

Options:
  --api-key <key>           Dimensions API key (or DIMENSIONS_API_KEY env)
  --clients <list>          Comma-separated: claude-desktop,cursor,vscode,windsurf
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

function createPrompt() {
  return createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

function ask(rl, question, { defaultValue = "", secret = false } = {}) {
  const suffix = defaultValue ? ` [${defaultValue}]` : "";
  return new Promise((resolve) => {
    if (secret && process.stdin.isTTY && process.stdin.setRawMode) {
      process.stdout.write(`${question}${suffix}: `);
      let value = "";
      const onData = (chunk) => {
        const text = chunk.toString();
        for (const char of text) {
          const code = char.charCodeAt(0);
          if (code === 13 || code === 10) {
            process.stdin.off("data", onData);
            process.stdin.setRawMode(false);
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
        process.stdin.setRawMode(true);
        process.stdin.resume();
        process.stdin.on("data", onData);
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

function buildServerEntry(apiKey, mainJs) {
  return {
    command: "node",
    args: [mainJs],
    env: { DIMENSIONS_API_KEY: apiKey },
  };
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

function configureClient(clientId, apiKey, mainJs) {
  const client = CLIENTS[clientId];
  const configPath = client.configPath();
  const entry = buildServerEntry(apiKey, mainJs);
  const doc = readJson(configPath);
  if (!doc[client.configKey]) doc[client.configKey] = {};
  doc[client.configKey][SERVER_NAME] = entry;
  backupFile(configPath);
  writeJson(configPath, doc);
  console.log(`  ${client.label}: ${configPath}`);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    printHelp();
    return;
  }

  assertNodeVersion();

  console.log("Dimensions Analytics MCP — setup wizard\n");

  const rl = createPrompt();
  try {
    const apiKey = await promptApiKey(rl, opts);
    const clientIds = await promptClients(rl, opts);

    if (!opts.yes) {
      const confirm = await ask(
        rl,
        `Install and configure ${clientIds.map((id) => CLIENTS[id].label).join(", ")}?`,
        { defaultValue: "y" },
      );
      if (!/^y(es)?$/i.test(confirm)) {
        console.log("Cancelled.");
        return;
      }
    }

    runNpmInstall();
    const mainJs = resolveMainJs();

    console.log("\nConfiguring MCP clients...");
    for (const clientId of clientIds) {
      configureClient(clientId, apiKey, mainJs);
    }

    console.log(`
Done!

Next steps:
  1. Quit and reopen each configured app (Claude Desktop, Cursor, VS Code, etc.).
  2. Look for "dimensions" in the app's MCP / integrations list.
  3. Try a prompt — ${REPO_URL}/blob/main/docs/USAGE.md

Installed server: ${mainJs}
`);
  } finally {
    rl.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
