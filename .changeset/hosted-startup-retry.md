---
"@digital-science-dsl/dimensions-analytics-mcp": minor
---

The hosted HTTP server no longer exits when dsl-service is not reachable at startup (`Failed to start HTTP server: Network error: fetch failed`). It starts listening right away and retries the schema load with exponential backoff (1 s up to 30 s). Until the schema loads, `GET /health` returns 503 `{"status":"starting"}` with the last load error, and `POST /mcp` returns 503 with `Retry-After: 5` (WEBAPPDEV-14210).
