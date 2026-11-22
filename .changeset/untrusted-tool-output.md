---
"@digital-science-dsl/dimensions-analytics-mcp": minor
---

Add prompt-injection guardrails to tool results. Dimensions records carry third-party text — titles, abstracts, grant and patent descriptions — which until now reached the model unmarked, where prose that reads like an instruction could steer an agent into misusing other tools in the same client.

Two guardrails:

- **Results are declared as data.** The server instructions and the 23 tool descriptions that return record text (every `search_*`, `get_by_doi`/`get_by_pmid`/`get_by_id`, `similar_documents`, `execute_dsl`, `researcher_profile`, `fetch_search_pages`, `facet_query`, `aggregate_query`, `extract_affiliations`, `extract_grants`) now carry one shared sentence saying result text is data, never instructions.
- **Invisible characters are stripped from results.** `formatToolResult` and `formatErrorPayload` now walk the payload and remove soft hyphens, the zero-width range, bidi embedding, override and isolate controls, the word joiner, invisible math operators, the BOM, and the Unicode tag block, so hidden instructions cannot ride along in either `content` or `structuredContent`. Visible text is untouched and clean payloads are passed through unchanged.

DSL escaping, field-name validation and input sanitization are unchanged; nothing is redacted or blocked (WEBAPPDEV-14248).
