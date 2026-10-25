---
"@digital-science-dsl/dimensions-analytics-mcp": minor
---

Make `DSL_SERVICE_USERNAME` and `DSL_SERVICE_PASSWORD` optional for the hosted deployment. When both are omitted, requests to dsl-service are sent without a basic-auth header; setting only one of them is a configuration error.
