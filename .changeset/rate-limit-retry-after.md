---
"@digital-science-dsl/dimensions-analytics-mcp": minor
---

Rate-limited requests (HTTP 429) now honour the server's `Retry-After` header and retry at most once, and only when the wait is 10 seconds or less. Otherwise the tool returns `Rate limit exceeded — retry after N seconds` (with `retryAfter` in the error payload) instead of retrying up to three times or hanging the tool call. Applies to the hosted DSL proxy and the public API client (WEBAPPDEV-14210).
