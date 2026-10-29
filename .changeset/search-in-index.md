---
"@digital-science-dsl/dimensions-analytics-mcp": minor
---

Add an optional `searchIn` parameter to the `search_*`, `fetch_search_pages`, `facet_query`, `aggregate_query`, `citation_trend` and `funding_trend` tools. Set it to `title_abstract_only` (or `title_only`, `full_data_exact`, …) to match the query against titles and abstracts instead of full text, so rankings and counts reflect work that is about the topic. Omitting it keeps today's full-text search. An index the entity does not support, or `searchIn` without `query`, returns a validation error naming the valid indexes and sends no API request (WEBAPPDEV-14092).
