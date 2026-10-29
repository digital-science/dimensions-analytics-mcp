# Changelog

## 1.6.0

### Minor Changes

- Add an optional `searchIn` parameter to the `search_*`, `fetch_search_pages`, `facet_query`, `aggregate_query`, `citation_trend` and `funding_trend` tools. Set it to `title_abstract_only` (or `title_only`, `full_data_exact`, …) to match the query against titles and abstracts instead of full text, so rankings and counts reflect work that is about the topic. Omitting it keeps today's full-text search. An index the entity does not support, or `searchIn` without `query`, returns a validation error naming the valid indexes and sends no API request (WEBAPPDEV-14092).
- The hosted HTTP server no longer exits when dsl-service is not reachable at startup (`Failed to start HTTP server: Network error: fetch failed`). It starts listening right away and retries the schema load with exponential backoff (1 s up to 30 s). Until the schema loads, `GET /health` returns 503 `{"status":"starting"}` with the last load error, and `POST /mcp` returns 503 with `Retry-After: 5` (WEBAPPDEV-14210).
- Rate-limited requests (HTTP 429) now honour the server's `Retry-After` header and retry at most once, and only when the wait is 10 seconds or less. Otherwise the tool returns `Rate limit exceeded — retry after N seconds` (with `retryAfter` in the error payload) instead of retrying up to three times or hanging the tool call. Applies to the hosted DSL proxy and the public API client (WEBAPPDEV-14210).
- Hosted requests to dsl-service now send the deployment's identity in `additional_logging_info` (`mcp_instance`: the `DSL_HOST`, `mcp_deployment_user`: `mcp@<DSL_HOST>`), so dsl usage logs can be grouped per instance. The end user's email from the validated API key stays in `X-DIMENSIONS-USER`. The header contract is documented in `docs/USAGE_TRACKING_ROLLOUT.md` (WEBAPPDEV-14210).

### Patch Changes

- Hosted deployments now build `profile_url` links (publications, grants, patents, clinical trials, datasets, policy documents, researchers, organizations) on the instance's own `DSL_HOST` instead of app.dimensions.ai when `DIMENSIONS_BASE_URL` is unset, so private-instance users get links they can open (WEBAPPDEV-14210).
- Name the VS Code client "GitHub Copilot in VS Code" in the docs and installer so it is not mistaken for Microsoft 365 Copilot or Copilot Studio, which are not supported (WEBAPPDEV-14208).

## 1.5.0

### Minor Changes

- `DSL_SERVICE_USERNAME` and `DSL_SERVICE_PASSWORD` are now optional for the hosted deployment. When both are omitted, requests to dsl-service are sent without a basic-auth header; setting only one of them is a configuration error.

## 1.4.8

### Patch Changes

- Every tool now returns an MCP `title` alongside its read-only annotations.
- The Claude Desktop extension page shows the Dimensions logo, a full description (use cases, authentication, requirements, privacy), keywords, and a static list of all 27 tools. A test fails if the manifest's tool list drifts from the tools the stdio server registers.
- The READMEs gain a Privacy Policy section describing the usage metadata sent with each request.
- The hosted-server notes no longer list Claude Desktop as unsupported or point claude.ai users to the desktop extension.

## 1.4.7

### Patch Changes

- Hosted HTTP servers no longer write a schema cache file to the container user's home directory when `SCHEMA_CACHE_PATH` is unset. 1.4.6 applied the local stdio default cache path in every mode. A failed cache write is now logged instead of failing the schema load or `refresh_schema`.

## 1.4.6

### Patch Changes

- Answer MCP `initialize` immediately in local stdio mode (WEBAPPDEV-14080 follow-up). Startup used to wait for JWT auth plus `describe schema` before replying, which could take 6–12 seconds. Claude Desktop gives up after about 10 seconds and reports a failed connection even when the URL and key are valid. The server now starts from the on-disk schema cache, or from a schema snapshot bundled with the package on first launch, and refreshes from the API in the background. Local servers now cache the schema by default in the OS user cache directory, one file per instance host (`SCHEMA_CACHE_PATH` still overrides this). `refresh_schema` now also updates query validation. Maintainers can refresh the bundled snapshot with `pnpm run schema:snapshot`.

## 1.4.5

### Patch Changes

- Fix the Claude Desktop extension ignoring a custom instance URL (WEBAPPDEV-14080). The server now accepts a bare host such as `trial.dimensions.ai`, a trailing slash, or a pasted page URL in `DIMENSIONS_BASE_URL`, and resolves each to the instance origin. An empty value or an unset extension placeholder falls back to `app.dimensions.ai`. Before, any of these failed URL validation at startup. The extension's instance URL field no longer has a prefilled default, so it holds exactly what the user enters.

## 1.4.4

### Patch Changes

- Allow `search_*` tools to omit `query` for filters-only searches. The shared input schema previously required a free-text `query` string even though the description already said it could be omitted and the DSL query builder already supported filter-only searches, causing tool calls with only `filters` to fail validation. Also clarified the `filters` field description with the required `field`/`operator`/`value` shape and supported operators.

## 1.4.3

### Patch Changes

- Package the existing local server as a Claude Desktop extension and publish it with each release.

## 1.4.2

### Patch Changes

- [#2](https://github.com/digital-science/dimensions-analytics-mcp/pull/2) [`c2e163a`](https://github.com/digital-science/dimensions-analytics-mcp/commit/c2e163ad5c7644bfa5349367c56a707c2af525bd) Thanks [@akovari](https://github.com/akovari)! - Add the `mcpName` ownership marker and npm keywords so the package can back a record in the official MCP Registry under `ai.dimensions/analytics-mcp`.

- [#2](https://github.com/digital-science/dimensions-analytics-mcp/pull/2) [`c2e163a`](https://github.com/digital-science/dimensions-analytics-mcp/commit/c2e163ad5c7644bfa5349367c56a707c2af525bd) Thanks [@akovari](https://github.com/akovari)! - Replace non-null assertions with typed public/internal client config, and bump `@types/node` to 24 and `fast-check` to 4.9.

## 1.4.1

### Patch Changes

- Replace non-null assertions with typed public/internal client config, and bump `@types/node` to 24 and `fast-check` to 4.9.

## 1.4.0

### Minor Changes

- Always return canonical profile URLs plus identity fields (`id`, and `doi` for publications) so agents can open and cite records without inventing broken Dimensions links.

## 1.3.1

### Patch Changes

- Document and prompt for `DIMENSIONS_BASE_URL` so custom-instance users (for example `your-instance.dimensions.ai`) are not authenticated against `app.dimensions.ai` and fail with 401.

## 1.3.0

### Minor Changes

- Check npm on startup and auto-install same-major updates for guided prefix installs. Other layouts log a stale-version warning with a manual upgrade recipe.

- Migrate to MCP TypeScript SDK v2 so advertised tool schemas use JSON Schema 2020-12, unblocking Claude Desktop/Code clients that reject draft-07 `outputSchema`.

## 1.2.0

### Minor Changes

- Add `similar_documents` MCP tool for concept-based similar publication/grant lookup from abstract text (replacing the need to hand-write `similar_documents()` via `execute_dsl`).

## 1.1.0

### Minor Changes

- Add structured search tools for previously missing schema sources: `search_reports`, `search_source_titles`, `search_funder_groups`, and `search_research_org_groups` (also available via analytics / `fetch_search_pages` entity types).

## 1.0.4

### Patch Changes

- Send hosted usage metadata via X-Dimensions-\* headers for dsl-service. Share retry logic between public API and internal dsl-service clients. Forward client IP with X-Forwarded-For for downstream throttling. Remove redundant body-side dsl logging helpers (server derives MCP user fields).

## 1.0.3

- README intro, prerequisites, and API key link to account settings
- Move hosted coming-soon notice to INSTALLATION
- REFERENCE note for troubleshooting; clearer field aliases description
