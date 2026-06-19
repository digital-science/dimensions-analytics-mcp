# Installation

## Quick setup (recommended)

Use the guided installer. It checks Node.js, downloads Dimensions Analytics MCP, asks for your API keys, and configures your AI apps. **No need to clone this repository.**

### Mac or Linux

Paste in Terminal:

```bash
curl -fsSL https://raw.githubusercontent.com/digital-science/dimensions-analytics-mcp/main/scripts/install.sh | bash
```

Install [Node.js 20+](https://nodejs.org/) first if prompted (the script can install via Homebrew on Mac).

### Windows

Paste in **PowerShell**:

```powershell
irm https://raw.githubusercontent.com/digital-science/dimensions-analytics-mcp/main/scripts/install.ps1 | iex
```

Install [Node.js 20+](https://nodejs.org/) first if prompted (the script can install via `winget`).

### What the installer does

1. Asks for your **Dimensions API key** — same key as the [Dimensions DSL API](https://docs.dimensions.ai/dsl/).
2. Asks which apps to configure: **Claude Desktop**, **Cursor**, **VS Code (Copilot MCP)**, or **Windsurf**.
3. Installs `@digital-science-dsl/dimensions-analytics-mcp` from npm to `~/.dimensions-analytics-mcp` and updates each app’s MCP config file.
4. Backs up any existing config before changing it.

No GitHub account or token is required.

**When finished:** quit and reopen each configured app. You should see **dimensions** in the MCP integrations list.

Example prompts: **[USAGE.md](./USAGE.md)**.

### Pin a release (optional)

```bash
DIMENSIONS_MCP_INSTALL_REF=v1.0.3 curl -fsSL https://raw.githubusercontent.com/digital-science/dimensions-analytics-mcp/main/scripts/install.sh | bash
```

### Non-interactive (advanced)

```bash
curl -fsSL https://raw.githubusercontent.com/digital-science/dimensions-analytics-mcp/main/scripts/install.mjs -o /tmp/install.mjs
export DIMENSIONS_API_KEY=...
node /tmp/install.mjs --clients claude-desktop,cursor --yes
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

`-y` lets `npx` download the package without prompting. The first start may be slower while npm fetches the package; later starts use the npm cache.

If `npx` is not found when the app launches, use the [guided installer](#quick-setup-recommended) (installs under `~/.dimensions-analytics-mcp` with an explicit `node` path) or Option B below.

**Option B — global npm install**

```bash
npm install -g @digital-science-dsl/dimensions-analytics-mcp
```

### 2. MCP configuration (stdio, global install)

Pass your Dimensions API key in `env`. The installer uses a local `node` path under `~/.dimensions-analytics-mcp` for reliability; a global install can use `"command": "dimensions-analytics-mcp"` instead.

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
| **VS Code** (Copilot MCP) | `~/.vscode/mcp.json` — Command Palette: *MCP: Open User Configuration* |
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

On native Windows, if `dimensions-analytics-mcp` fails to start, use `"command": "node"` with the full path to `main.js` (see installer output).

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

## Hosted Dimensions Analytics MCP (coming soon)

A **hosted** option — connect from your AI app via URL and Bearer token, with no Node.js install — is **not available yet**. We will announce it in the near future on [dimensions.ai](https://www.dimensions.ai/) and in this repository.

When it launches, setup will be documented here. For now, use the [quick setup](#quick-setup-recommended) above (local stdio).
