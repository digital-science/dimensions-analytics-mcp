---
"@digital-science-dsl/dimensions-analytics-mcp": minor
---

Hosted requests to dsl-service now send the deployment's identity in `additional_logging_info` (`mcp_instance`: the `DSL_HOST`, `mcp_deployment_user`: `mcp@<DSL_HOST>`), so dsl usage logs can be grouped per instance. The end user's email from the validated API key stays in `X-DIMENSIONS-USER`. The header contract is documented in `docs/USAGE_TRACKING_ROLLOUT.md` (WEBAPPDEV-14210).
