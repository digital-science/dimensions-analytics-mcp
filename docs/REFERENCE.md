# Reference

Quick lookup for names, paths, and stdio configuration. **You won’t need most of this unless you’re troubleshooting or doing a manual setup** — for normal use, see [INSTALLATION.md](./INSTALLATION.md) and [USAGE.md](./USAGE.md).

## Names and paths

| What | Value |
|------|--------|
| Product name | **Dimensions Analytics MCP** |
| npm package | `@digital-science-dsl/dimensions-analytics-mcp` |
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
| `DIMENSIONS_BASE_URL` | Dimensions API base URL (default `https://app.dimensions.ai`) |
| `SCHEMA_CACHE_PATH` | Read/write last-good `describe schema` JSON (envelope with `cachedAt`) |
| `SCHEMA_CACHE_TTL_MS` | Max cache age before refresh from API (default `86400000` = 24h) |
| `DIMENSIONS_MAX_RETRIES` | HTTP retry attempts for transient/rate-limit errors (default `3`) |
| `DIMENSIONS_RETRY_DELAY_MS` | Base delay in ms for exponential backoff between retries (default `1000`) |
| `DIMENSIONS_RATE_LIMIT_PER_MINUTE` | Client-side request cap per minute (default `30`, matching the API limit) |

The config loader also accepts `DIMENSIONS_DSL_API_KEY` and `DIMENSIONS_DSL_BASE_URL` as aliases.

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

The Dimensions API enforces **30 requests per IP per minute** at the edge. It does not return `Retry-After` or `X-RateLimit-*` headers.

The client prevents most 429s with a **sliding-window rate limiter** (default 30 req/min). Before each request it waits for an available slot. On 429, it retries using the limiter's slot timing rather than parsing response headers.

Transient failures (429, 5xx, network, timeout) use exponential backoff with jitter. Configure via `DIMENSIONS_MAX_RETRIES` and `DIMENSIONS_RETRY_DELAY_MS`.

On rate-limit errors surfaced to MCP tools, the payload includes `retryAfter` (seconds) and `clientRateLimit` (`remaining`, `retryAfterMs`) so agents know how long to wait.

## Schema cache (cold-start)

At startup the server loads `describe schema` from the API. To speed cold-start and survive API outages:

1. **Fresh cache** (within `SCHEMA_CACHE_TTL_MS`) — load from disk, skip the API call
2. **Expired or missing cache** — fetch from the API and rewrite the cache file
3. **API failure** — fall back to the last on-disk cache (even if expired) and mark schema `stale: true`

Use `describe_schema` (default) or `dimensions://schema/summary` for a compact overview. Use `describe_schema` with `full=true` or `dimensions://schema` for the full describe payload. Call `refresh_schema` to force a live reload.
