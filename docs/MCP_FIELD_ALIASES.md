# MCP field aliases

Structured MCP tools accept **LLM-friendly field names** in `fields`, `sortBy`, `facetField`, `filters[].field`, and `indicators`. The server resolves aliases to canonical Dimensions DSL names before building queries.

**Rules:**

- Aliases are **additive** — raw DSL names always work.
- Unknown names pass through unchanged (the API validates on execute).
- Aliases apply only to structured tools, not `execute_dsl`.

For worked examples (search, facets, DSL), see [USAGE.md](./USAGE.md). For implementation details, see **dimensions-analytics-mcp-deploy** [FIELD-ALIASES.md](https://github.com/digital-science/dimensions-analytics-mcp-deploy/blob/main/docs/FIELD-ALIASES.md).

## Publications

| Alias | DSL name |
|-------|----------|
| `total_citations` | `times_cited` |
| `citation_ratio` | `field_citation_ratio` |
| `altmetric_score` | `altmetric` |
| `fields_of_research` | `category_for` |
| `sdg_categories` | `category_sdg` |
| `field_citation_ratio_avg` | `fcr_gavg` (aggregate indicator) |
| `relative_citation_ratio_avg` | `rcr_avg` (aggregate indicator) |
| `total_citations_sum` | `citations_total` (aggregate indicator) |
| `average_citations` | `citations_avg` (aggregate indicator) |
| `median_citations` | `citations_median` (aggregate indicator) |

## Grants

| Alias | DSL name |
|-------|----------|
| `funding_amount_usd` | `funding_usd` |
| `funding_amount_eur` | `funding_eur` |
| `funder_name` | `funder_org_name` (search filter) |
| `funders` | `funder_orgs` (grants facet field on `facet_query` / `aggregate_query`) |
| `total_funding` | `funding` (aggregate indicator) |

## Researchers

| Alias | DSL name |
|-------|----------|
| `orcid` | `orcid_id` |

## Other entities

Patents, clinical trials, datasets, policy documents, and organizations have no aliases yet. Use names from `dimensions://fields/{entityType}`.

## Discovering fields

1. `dimensions://fields/publications` (and other entity types) — live describe metadata plus reverse alias hints where configured.
2. [Official DSL documentation](https://docs.dimensions.ai/dsl/)
