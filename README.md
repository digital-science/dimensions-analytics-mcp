# Dimensions Analytics MCP

Connect [Cursor](https://cursor.com), [Claude Desktop](https://claude.ai), VS Code, and other MCP clients to [Dimensions](https://www.dimensions.ai/) research data.

Dimensions Analytics MCP lets your AI assistant search publications, grants, researchers, and more; run analytics and trends; look up DOIs and Dimensions IDs; and explore the live Dimensions schema — all through natural language in tools your client already supports.

After a short install, you configure your MCP client once, restart the app, and use **dimensions** like any other integration. Example prompts and workflows are in **[docs/USAGE.md](./docs/USAGE.md)**.

## Prerequisites

- **[Node.js 20+](https://nodejs.org/)** — required for the local stdio server (the installer can help you install it)
- **[Dimensions API key](https://app.dimensions.ai/account/settings/general)** — from your [Dimensions](https://www.dimensions.ai/) account (same key as the [Dimensions DSL API](https://docs.dimensions.ai/dsl/))

Don’t have an API key yet? [Request a demo or quote here](https://www.dimensions.ai/request-a-demo-or-quote/).

## Quick install

**Mac / Linux** — paste in Terminal:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/digital-science/dimensions-analytics-mcp/main/scripts/install.sh)"
```

**Windows** — paste in PowerShell:

```powershell
irm https://raw.githubusercontent.com/digital-science/dimensions-analytics-mcp/main/scripts/install.ps1 | iex
```

The installer checks Node.js, downloads Dimensions Analytics MCP, asks for your API key, and configures Claude Desktop, Cursor, VS Code (Copilot), or Windsurf. Full details: **[Installation](./docs/INSTALLATION.md)**.

No GitHub token is required. The installer downloads `@digital-science-dsl/dimensions-analytics-mcp` from npm.

When done, **restart your AI app** and look for **dimensions** in MCP settings.

## Using Dimensions in chat

Once connected, ask your assistant to search publications, grants, researchers, run analytics, or look up a DOI.

Tool reference: [docs/USAGE.md](./docs/USAGE.md#all-mcp-tools).

## More documentation

- [Installation](./docs/INSTALLATION.md) — guided installer and manual setup
- [Usage guide](./docs/USAGE.md) — workflows for AI assistants
- [Reference](./docs/REFERENCE.md) — names, env vars, rate limits, schema cache
- [MCP field aliases](./docs/MCP_FIELD_ALIASES.md) — field name shortcuts accepted by search tools

Package: [`@digital-science-dsl/dimensions-analytics-mcp`](https://www.npmjs.com/package/@digital-science-dsl/dimensions-analytics-mcp) on npm.

## License

MIT
