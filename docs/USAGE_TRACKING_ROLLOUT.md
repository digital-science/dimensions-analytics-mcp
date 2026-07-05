# MCP usage tracking rollout

Step-by-step plan to deploy header-based usage metadata (MCP → dsl-service → DSL → Cloud Logging → BigQuery).

## Header contract (hosted MCP → dsl-service)

| Header | Example | Log field |
|--------|---------|-----------|
| `X-DIMENSIONS-USER` | `user@example.com` | auth + trace `user` (required) |
| `X-Dimensions-Channel` | `mcp` | `channel` |
| `X-Dimensions-MCP-Tool` | `search_publications` | `mcp_tool` |
| `X-Dimensions-MCP-Session-Id` | UUID | `mcp_session_id` |
| `X-Dimensions-MCP-Client` | `cursor` | `mcp_client` |
| `X-Dimensions-MCP-Version` | `1.0.4` | `mcp_version` |
| `X-Dimensions-MCP-Deployment` | `hosted` | `deployment_mode` |

When `X-Dimensions-Channel: mcp`, dsl-service derives `dimensions_user`, `mcp_user`, and `source` server-side from `X-DIMENSIONS-USER`.

Non-identity JSON body fields (e.g. `radar_version`) remain supported via `additional_log_info` / `additional_logging_info`.

---

## 1. Publish DSL library

- Release **dsl** (includes `ValidationContext` origin fix, `log_type` in trace, `build_usage_log_metadata`).
- Run `./make.sh version update` and publish to Cloudsmith.

## 2. Publish and deploy dsl-service

- Bump **dsl-service**; pin updated **dsl** dependency if needed.
- Deploy with `GCP_CREDENTIALS` / `GCP_LOGGER` configured for structured logging.
- Verify: POST `/query` with MCP headers → Cloud Logging entry contains `channel`, `mcp_tool`, `mcp_session_id`.
- Verify: existing Radar traffic unchanged (header `X-DIMENSIONS-USER` + JSON `radar_version` still works).

## 3. Publish and deploy hosted MCP

- Release **@digital-science-dsl/dimensions-analytics-mcp** (sends `X-Dimensions-*` headers; no JSON `additional_logging_info`).
- Deploy hosted MCP HTTP service together with or immediately after dsl-service.
- Verify: tool call → Cloud Logging shows per-tool and session fields.

## 4. BigQuery (ops)

- Configure Cloud Logging sink → BigQuery dataset for dsl-service traces.
- Create view with columns: `timestamp`, `channel`, `mcp_tool`, `mcp_client`, `mcp_session_id`, `user`, `log_type`, `radar_version`, `api`, `host`, `product_variant`.

## 5. Local stdio MCP (public API team — separate)

- Local MCP already sends `X-Dimensions-*` headers on `/api/dsl/v2` (no effect until public API forwards them).
- Public API team: forward headers to dsl-service or parse into `additional_log_info`.
- Hand off this document’s header table.

## 6. Documentation

- DSL docs: [mcp.rst](https://github.com/digital-science/dsl/blob/main/docs/mcp.rst) (user-facing install).
- MCP repo: REFERENCE.md — document usage headers for hosted deployment.

---

## Separate work: Radar (dim-web-radar)

Not required for rollout. Radar already sends `X-DIMENSIONS-USER` and works with current dsl-service.

Optional cleanup PR when convenient:

1. Remove redundant `user` from `additional_log_info` in `solr_webapp/modules/dsl/client.py` (header is canonical).
2. Remove redundant `product_variant` from logging dict (top-level `variant` is enough).
3. Keep `radar_version` in JSON — still the right place for Radar-specific metadata.
4. Update unit tests / VCR cassettes in `tests_app/modules/dsl/`.

No Radar change is needed before steps 1–3 above.
