# Reference

Quick lookup for names, paths, and stdio configuration. **You won’t need most of this unless you’re troubleshooting or doing a manual setup** — for normal use, see [INSTALLATION.md](./INSTALLATION.md) and [USAGE.md](./USAGE.md).

## Names and paths

| What | Value |
|------|--------|
| Product name | **Dimensions Analytics MCP** |
| npm package | `@digital-science-dsl/dimensions-analytics-mcp` |
| MCP Registry name | `ai.dimensions/analytics-mcp` |
| stdio CLI | `dimensions-analytics-mcp` |
| MCP client config key | `dimensions` (under `mcpServers` or `servers`) |
| Guided install directory | `~/.dimensions-analytics-mcp` |
| API key env var | `DIMENSIONS_API_KEY` (same as the Dimensions DSL API) |

Install from npm does not require a GitHub token — see [INSTALLATION.md](./INSTALLATION.md).

## Environment variables (stdio)

### Required

| Variable | Purpose |
|----------|---------|
| `DIMENSIONS_API_KEY` | Dimensions API key |

### Optional

| Variable | Purpose |
|----------|---------|
| `DIMENSIONS_BASE_URL` | Dimensions API base URL. **Required for custom instances** (e.g. `https://your-instance.dimensions.ai`). Default `https://app.dimensions.ai`. Omit this variable on the standard instance. |
| `SCHEMA_CACHE_PATH` | Read/write last-good `describe schema` JSON (envelope with `cachedAt`) |
| `SCHEMA_CACHE_TTL_MS` | Max cache age before refresh from API (default `86400000` = 24h) |
| `DIMENSIONS_MAX_RETRIES` | HTTP retry attempts for transient errors (default `3`; 429s retry at most once) |
| `DIMENSIONS_RETRY_DELAY_MS` | Base delay in ms for exponential backoff between retries (default `1000`) |
| `DIMENSIONS_RATE_LIMIT_PER_MINUTE` | Client-side request cap per minute (default `30`, matching the API limit) |
| `DIMENSIONS_MCP_AUTO_UPDATE` | Set to `0` / `false` / `off` to disable prefix auto-**install**. Version warnings still run. Default: on for guided prefix installs only |
| `DIMENSIONS_MCP_UPDATE_CHECK` | Set to `0` / `false` / `off` to skip `npm view`, warnings, and auto-install (air-gapped machines) |
| `DIMENSIONS_MCP_AUTO_UPDATE_INTERVAL_MS` | How often to check npm (default `86400000` = 24h) |

Auto-install runs only for the guided prefix layout (`~/.dimensions-analytics-mcp`). npx, global, and source installs never self-install (the hosted server needs no client-side updates); they may log a stale-version warning with a manual recipe. See [INSTALLATION.md#updating](./INSTALLATION.md#updating).

The config loader also accepts `DIMENSIONS_DSL_API_KEY` and `DIMENSIONS_DSL_BASE_URL` as aliases.

**Custom instance:** Keys from a host other than `app.dimensions.ai` must be used with `DIMENSIONS_BASE_URL` set to that host (no trailing slash). Otherwise authentication fails with `401 Unauthorized`. Example MCP `env`:

```json
"env": {
  "DIMENSIONS_API_KEY": "your-api-key",
  "DIMENSIONS_BASE_URL": "https://your-instance.dimensions.ai"
}
```

## Config file (optional)

`.dimensions.config.json` in the working directory or home directory:

```json
{
  "dsl": {
    "apiKey": "your-key",
    "baseUrl": "https://app.dimensions.ai"
  }
}
```

Environment variables override file values where both are set.

## Retries and rate limits

The Dimensions API enforces **30 requests per IP per minute** at the edge. Hosted deployments go through a per-cluster DSL proxy that has its own limit.

The client prevents most 429s with a **sliding-window rate limiter** (default 30 req/min). Before each request it waits for an available slot.

On 429, the client waits for the server's `Retry-After` header when present, otherwise for the limiter's slot timing, and retries **once**. If the wait exceeds 10 seconds, or the retry is rate limited again, the tool fails immediately with `Rate limit exceeded — retry after N seconds` so the AI client does not hang on a tool call.

Other transient failures (5xx, network, timeout) use exponential backoff with jitter. Configure via `DIMENSIONS_MAX_RETRIES` (an upper bound that also covers the single 429 retry) and `DIMENSIONS_RETRY_DELAY_MS`.

On rate-limit errors surfaced to MCP tools, the payload includes `retryAfter` (seconds), `serverRetryAfterMs` (from `Retry-After`, when sent), and `clientRateLimit` (`remaining`, `retryAfterMs`) so agents know how long to wait.

## Schema cache (cold-start)

At startup the server loads `describe schema` from the API. To speed cold-start and survive API outages:

1. **Fresh cache** (within `SCHEMA_CACHE_TTL_MS`) — load from disk, skip the API call
2. **Expired or missing cache** — fetch from the API and rewrite the cache file
3. **API failure** — fall back to the last on-disk cache (even if expired) and mark schema `stale: true`

Use `describe_schema` (default) or `dimensions://schema/summary` for a compact overview. Use `describe_schema` with `full=true` or `dimensions://schema` for the full describe payload. Call `refresh_schema` to force a live reload.
