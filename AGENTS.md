# dimensions-analytics-mcp

Single-package MCP server for the Dimensions DSL API. Vitest for tests.

See [README.md](./README.md). Maintainer docs: private `dimensions-analytics-mcp-deploy` repo (sibling at `../dimensions-analytics-mcp-deploy`).

## Layout

```text
apps/mcp/src/
  client/   HTTP, auth (JWT), dsl-service adapter (hosted)
  dsl/      DimensionsClient, QueryBuilder, schema, commands
  mcp/      MCP tools, resources, stdio + HTTP transport
  main.ts   stdio entry
  http-main.ts  hosted HTTP entry (deploy repo docs)
```

## Commands

```bash
pnpm install
pnpm run build
pnpm run test              # unit + mock hosted e2e
pnpm run integration:smoke   # live stdio (DIMENSIONS_API_KEY)
pnpm run typecheck
```

## MCP app

See **dimensions-analytics-mcp-deploy** [CLAUDE.md](../dimensions-analytics-mcp-deploy/docs/CLAUDE.md). Maintainer docs (testing, publishing, architecture): **dimensions-analytics-mcp-deploy** `docs/`.
