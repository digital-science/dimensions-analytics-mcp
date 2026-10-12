# Installation

There are two ways to connect an AI app to Dimensions:

- **Local server** — runs on your computer (Claude Desktop extension, guided installer, or manual setup). Works with every MCP client and every Dimensions instance, and supports all tools.
- **[Hosted server](#hosted-server)** — connect your app to `https://app.dimensions.ai/mcp` with your API key. No Node.js and nothing to update. Available on the standard instance for clients that can send an `Authorization` header (Cursor, VS Code, Windsurf, Claude Code, Codex CLI, …).

## Install in Claude Desktop

1. [Download the latest Dimensions Analytics extension](https://github.com/digital-science/dimensions-analytics-mcp/releases/latest/download/dimensions-analytics-mcp.mcpb).
2. In Claude Desktop, open **Settings → Extensions → Advanced settings → Install Extension…** and select the downloaded `.mcpb` file.
3. Enter your Dimensions Analytics API key when prompted. If you log in somewhere other than `app.dimensions.ai` (for example `trial.dimensions.ai` or `eu.dimensions.ai`), enter that host as the instance URL; leave it empty otherwise. You can change it later in the extension settings. Then ask Claude, for example, “Find the 20 most-cited publications on CRISPR gene editing since 2020.”

This extension contains the local MCP server and its dependencies. Claude Desktop supplies the Node runtime and stores the API key as sensitive extension configuration. An Analytics API subscription is required. The extension works on macOS and Windows.

To update a bundle downloaded from GitHub, download and install the latest `.mcpb` again. Sideloaded bundles do not update automatically; extensions installed from Claude's official directory do. The extension does not use the npm updater. The [manual MCP config](#manual-setup) remains available for other clients.

## Guided setup for other MCP clients

Use the guided installer. It checks Node.js, downloads Dimensions Analytics MCP, asks for your API keys, and configures your AI apps. **No need to clone this repository.**

### Mac or Linux

Paste in Terminal:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/digital-science/dimensions-analytics-mcp/main/scripts/install.sh)"
```

Use this form (not `curl … | bash`). Piping the script to bash leaves stdin as the pipe, so the wizard cannot read your answers.

Install [Node.js 20+](https://nodejs.org/) first if prompted (the script can install via Homebrew on Mac).

### Windows

Paste in **PowerShell**:

```powershell
irm https://raw.githubusercontent.com/digital-science/dimensions-analytics-mcp/main/scripts/install.ps1 | iex
```

Install [Node.js 20+](https://nodejs.org/) first if prompted (the script can install via `winget`).

### What the installer does

1. Asks for your **Dimensions API key** — same key as the [Dimensions DSL API](https://docs.dimensions.ai/dsl/).
2. Asks for a **custom instance URL** if you do not use `app.dimensions.ai` (optional; press Enter for the standard instance).
3. Asks which apps to configure: **Claude Desktop**, **Cursor**, **VS Code (Copilot MCP)**, or **Windsurf**.
4. For Cursor, VS Code, and Windsurf, offers the **[hosted server](#hosted-server)** as an alternative to the local one (only when your instance has a hosted endpoint). Choosing hosted checks your API key against the endpoint. Claude Desktop always uses the local server.
5. Installs `@digital-science-dsl/dimensions-analytics-mcp` from npm to `~/.dimensions-analytics-mcp` (skipped when every app is hosted) and updates each app’s MCP config file.
6. Backs up any existing config before changing it.

No GitHub account or token is required.

**Claude Desktop:** if Claude is still running when the installer configures it, the wizard pauses and asks you to quit Claude (macOS: Cmd+Q; Windows: Exit from the tray icon — closing the window is not enough), then press Enter to continue. Only Claude needs this; Cursor / VS Code / Windsurf are configured in the same run without stopping. If Claude is running it can overwrite `claude_desktop_config.json` from memory and drop the new entry.

**When finished:** open (or reopen) each configured app. You should see **dimensions** in the MCP integrations list. For Claude Desktop, confirm Chat mode (Cowork does not read `claude_desktop_config.json`).

Example prompts: **[USAGE.md](./USAGE.md)**.

### Updating

Guided installs under `~/.dimensions-analytics-mcp` check npm about once a day. Same-major releases install in place and the server reloads in that spawn. New **major** versions are never applied automatically.

If you installed **before** this updater existed (for example 1.0.x), upgrade **once** with the same installer command, then later minor/patch releases can apply automatically:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/digital-science/dimensions-analytics-mcp/main/scripts/install.sh)"
```

```powershell
irm https://raw.githubusercontent.com/digital-science/dimensions-analytics-mcp/main/scripts/install.ps1 | iex
```

Or, without the wizard:

```bash
npm install @digital-science-dsl/dimensions-analytics-mcp@latest --prefix ~/.dimensions-analytics-mcp
```

Then reopen your AI app.

**npx, global, and source** installs do not auto-install. When a newer version is on npm, the server logs a warning (stderr / MCP logs) with the command to run:

- **npx** — set MCP `args` to `["-y", "@digital-science-dsl/dimensions-analytics-mcp@latest"]` (or clear the npx cache) and restart. Without `@latest`, npx keeps the cached tarball.
- **global** — `npm install -g @digital-science-dsl/dimensions-analytics-mcp@latest`, then restart.
- **source** — `git pull && pnpm install && pnpm run build`.

The [hosted server](#hosted-server) needs no updates on your side.

Disable automatic installs with `DIMENSIONS_MCP_AUTO_UPDATE=0` in the MCP `env` block (version warnings still run). Disable checks entirely with `DIMENSIONS_MCP_UPDATE_CHECK=0`. Changelog: **[CHANGELOG.md](../apps/mcp/CHANGELOG.md)**.

### Pin a release (optional)

```bash
DIMENSIONS_MCP_INSTALL_REF=v1.2.0 bash -c "$(curl -fsSL https://raw.githubusercontent.com/digital-science/dimensions-analytics-mcp/main/scripts/install.sh)"
```

### Non-interactive (advanced)

```bash
curl -fsSL https://raw.githubusercontent.com/digital-science/dimensions-analytics-mcp/main/scripts/install.mjs -o /tmp/install.mjs
curl -fsSL https://raw.githubusercontent.com/digital-science/dimensions-analytics-mcp/main/scripts/install-config.mjs -o /tmp/install-config.mjs
export DIMENSIONS_API_KEY=...
# Custom instance only, e.g. https://your-instance.dimensions.ai
# export DIMENSIONS_BASE_URL=https://your-instance.dimensions.ai
node /tmp/install.mjs --clients claude-desktop,cursor --yes
# Hosted server for Cursor / VS Code / Windsurf instead of the local one:
# node /tmp/install.mjs --clients cursor,vscode --mode hosted --yes
```

### Run from a git clone (developers)

```bash
git clone https://github.com/digital-science/dimensions-analytics-mcp.git
cd dimensions-analytics-mcp
./scripts/install.sh          # Mac / Linux
```

```powershell
git clone https://github.com/digital-science/dimensions-analytics-mcp.git
cd dimensions-analytics-mcp
.\scripts\install.ps1
```

---

## Manual setup

If you prefer to configure everything yourself:

### Custom Dimensions instance

If you log in at a URL other than `https://app.dimensions.ai` (for example `https://your-instance.dimensions.ai`), you **must** add `DIMENSIONS_BASE_URL` to the MCP `env` block. The snippets below show the standard instance. For a custom instance, use:

```json
"env": {
  "DIMENSIONS_API_KEY": "your-api-key",
  "DIMENSIONS_BASE_URL": "https://your-instance.dimensions.ai"
}
```

A key issued on a custom instance is valid only on that host. Without `DIMENSIONS_BASE_URL`, the server authenticates against `https://app.dimensions.ai` and start-up fails with `401 Unauthorized`.

### 1. Install the server

**Option A — `npx` (no global install)**

Requires [Node.js 20+](https://nodejs.org/) on your PATH (including for GUI apps such as Claude Desktop). Omit the version to get the latest from npm; add `@x.y.z` to `args` to pin a release.

**Cursor / Claude Desktop / Windsurf** — key `mcpServers`:

```json
{
  "mcpServers": {
    "dimensions": {
      "command": "npx",
      "args": ["-y", "@digital-science-dsl/dimensions-analytics-mcp"],
      "env": {
        "DIMENSIONS_API_KEY": "your-api-key"
      }
    }
  }
}
```

**Custom instance:** add `"DIMENSIONS_BASE_URL": "https://your-instance.dimensions.ai"` to `env` — see [Custom Dimensions instance](#custom-dimensions-instance).

**VS Code** — key `servers`:

```json
{
  "servers": {
    "dimensions": {
      "command": "npx",
      "args": ["-y", "@digital-science-dsl/dimensions-analytics-mcp"],
      "env": {
        "DIMENSIONS_API_KEY": "your-api-key"
      }
    }
  }
}
```

`-y` lets `npx` download the package without prompting. The first start may be slower while npm fetches the package; later starts use the npm cache and **will not pick up new releases** unless you pin `@latest` (see [Updating](#updating)).

If `npx` is not found when the app launches, use the [guided installer](#guided-setup-for-other-mcp-clients) (installs under `~/.dimensions-analytics-mcp` with an explicit `node` path) or Option B below.

**Option B — global npm install**

```bash
npm install -g @digital-science-dsl/dimensions-analytics-mcp
```

### 2. MCP configuration (stdio, global install)

Pass your Dimensions API key in `env` (and `DIMENSIONS_BASE_URL` on a custom instance). The installer uses a local `node` path under `~/.dimensions-analytics-mcp` for reliability; a global install can use `"command": "dimensions-analytics-mcp"` instead.

```json
{
  "command": "dimensions-analytics-mcp",
  "env": {
    "DIMENSIONS_API_KEY": "your-api-key"
  }
}
```

| Client | Config file |
|--------|-------------|
| **Cursor** | `~/.cursor/mcp.json` or `.cursor/mcp.json` |
| **Claude Desktop** (macOS) | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| **Claude Desktop** (Windows) | `%APPDATA%\Claude\claude_desktop_config.json` |
| **VS Code** (Copilot MCP) | User profile `mcp.json` — Command Palette: *MCP: Open User Configuration* (macOS: `~/Library/Application Support/Code/User/mcp.json`, Windows: `%APPDATA%\Code\User\mcp.json`, Linux: `~/.config/Code/User/mcp.json`). A workspace can also use `.vscode/mcp.json`. |
| **Windsurf** | `~/.codeium/windsurf/mcp_config.json` |

**Cursor / Claude Desktop / Windsurf** — key `mcpServers`:

```json
{
  "mcpServers": {
    "dimensions": {
      "command": "dimensions-analytics-mcp",
      "env": {
        "DIMENSIONS_API_KEY": "your-api-key"
      }
    }
  }
}
```

**VS Code** — key `servers`:

```json
{
  "servers": {
    "dimensions": {
      "command": "dimensions-analytics-mcp",
      "env": {
        "DIMENSIONS_API_KEY": "your-api-key"
      }
    }
  }
}
```

**Claude Code (CLI):**

```bash
claude mcp add --transport stdio --env DIMENSIONS_API_KEY=your-api-key dimensions -- dimensions-analytics-mcp
```

Custom instance: add `--env DIMENSIONS_BASE_URL=https://your-instance.dimensions.ai` (use your instance URL).

On native Windows, if `dimensions-analytics-mcp` fails to start, use `"command": "node"` with the full path to `main.js` (see installer output).

### Troubleshooting: installer said Done, but Claude has no dimensions entry

1. Open `~/Library/Application Support/Claude/claude_desktop_config.json` (Windows: `%APPDATA%\Claude\claude_desktop_config.json`) and check for a `"dimensions"` key under `mcpServers`.
2. If it is missing and a `.backup-*` file next to the config is byte-identical to the live file, Claude was almost certainly running during install and restored its previous config. Fully quit Claude, re-run the installer, verify `"dimensions"` is in the JSON **before** reopening Claude, then open Chat.
3. The guided installer pauses while Claude is running (press Enter after quitting), and verifies the entry after write. With `--yes`, quit Claude first or the installer exits instead of waiting.

---

## Build from source (contributors)

```bash
git clone https://github.com/digital-science/dimensions-analytics-mcp.git
cd dimensions-analytics-mcp
corepack enable
corepack prepare pnpm@9.15.9 --activate
pnpm install
pnpm run build
pnpm run test
```

Names, env vars, and tuning: [REFERENCE.md](./REFERENCE.md).

---

## Hosted server

The hosted Dimensions Analytics MCP server runs the same tools without anything installed on your computer:

| | |
|-|-|
| **URL** | `https://app.dimensions.ai/mcp` (Streamable HTTP) |
| **Authentication** | `Authorization: Bearer <your Dimensions API key>` — the same key as the DSL API |
| **Instances** | Standard instance (`app.dimensions.ai`) only. For a custom instance, use the local server with `DIMENSIONS_BASE_URL`. |
| **Differences** | No Node.js and no updates on your side. `fetch_search_pages` (exports results to local files) is not available; every other tool is. |

The [guided installer](#guided-setup-for-other-mcp-clients) can write these entries for Cursor, VS Code, and Windsurf (choose **Hosted** when asked, or pass `--mode hosted`). To configure it yourself:

**Cursor** — `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "dimensions": {
      "url": "https://app.dimensions.ai/mcp",
      "headers": {
        "Authorization": "Bearer your-api-key"
      }
    }
  }
}
```

**VS Code** — user `mcp.json` (*MCP: Open User Configuration*). This version prompts for the key once and stores it in VS Code's secret storage instead of the file:

```json
{
  "inputs": [
    {
      "type": "promptString",
      "id": "dimensions-api-key",
      "description": "Dimensions API key",
      "password": true
    }
  ],
  "servers": {
    "dimensions": {
      "type": "http",
      "url": "https://app.dimensions.ai/mcp",
      "headers": {
        "Authorization": "Bearer ${input:dimensions-api-key}"
      }
    }
  }
}
```

**Windsurf** — `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "dimensions": {
      "serverUrl": "https://app.dimensions.ai/mcp",
      "headers": {
        "Authorization": "Bearer your-api-key"
      }
    }
  }
}
```

**Claude Code (CLI):**

```bash
claude mcp add --transport http dimensions https://app.dimensions.ai/mcp \
  --header "Authorization: Bearer your-api-key"
```

**Codex CLI** — reads the key from an environment variable:

```bash
codex mcp add dimensions --url https://app.dimensions.ai/mcp --bearer-token-env-var DIMENSIONS_API_KEY
```

Other clients: use the URL above with an `Authorization: Bearer` header.

### Apps that cannot use the hosted server yet

The hosted server authenticates with your API key. Apps that only offer OAuth sign-in for remote servers cannot send it:

- **ChatGPT** — custom MCP servers support OAuth or no authentication only.
- **Claude Desktop / claude.ai custom connectors** — use the [Claude Desktop extension](#install-in-claude-desktop) instead. Fixed request headers are a limited beta, and on Team and Enterprise plans one connector (and its key) is shared by the whole organization.

Treat the key in these configs like a password: the files are not encrypted.
