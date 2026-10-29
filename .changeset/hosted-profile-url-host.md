---
"@digital-science-dsl/dimensions-analytics-mcp": patch
---

Hosted deployments now build `profile_url` links (publications, grants, patents, clinical trials, datasets, policy documents, researchers, organizations) on the instance's own `DSL_HOST` instead of app.dimensions.ai when `DIMENSIONS_BASE_URL` is unset, so private-instance users get links they can open (WEBAPPDEV-14210).
