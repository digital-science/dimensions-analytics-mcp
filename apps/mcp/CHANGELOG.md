# Changelog

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
