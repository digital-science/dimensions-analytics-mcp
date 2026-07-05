# Changelog

## 1.0.4

### Patch Changes

- Send hosted usage metadata via X-Dimensions-\* headers for dsl-service. Share retry logic between public API and internal dsl-service clients. Forward client IP with X-Forwarded-For for downstream throttling. Remove redundant body-side dsl logging helpers (server derives MCP user fields).

## 1.0.3

- README intro, prerequisites, and API key link to account settings
- Move hosted coming-soon notice to INSTALLATION
- REFERENCE note for troubleshooting; clearer field aliases description
