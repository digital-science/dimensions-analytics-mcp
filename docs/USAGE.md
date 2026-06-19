# Usage guide

How to use the Dimensions Analytics MCP server with an AI assistant or by calling tools directly. This guide assumes **local stdio** — see [INSTALLATION.md](./INSTALLATION.md). For env vars and names, see [REFERENCE.md](./REFERENCE.md).

Advanced NLP, classify, and similarity queries use **`execute_dsl`**.

## Before you query

1. **Connect the server** with your API key via local stdio (see [INSTALLATION.md](./INSTALLATION.md)).
2. **Let the host load tools** — on startup the server fetches live `describe schema` and registers tools/resources.
3. **Discover fields** before building filters:
   - MCP resource `dimensions://fields/publications` (replace entity as needed)
   - MCP resource `dimensions://schema/summary` — compact overview (start here)
   - MCP resource `dimensions://schema/limits` — numeric query limits
   - MCP resource `dimensions://schema/policy` — pagination and reasonable-use guardrails
   - MCP resource `dimensions://examples/{source}` — curated DSL snippets per source (or `dimensions://examples` for all)
   - [Official DSL documentation](https://docs.dimensions.ai/dsl/)

Structured tools accept [field aliases](./MCP_FIELD_ALIASES.md) (for example `total_citations` → `times_cited`). Raw DSL names always work.

## Recommended workflow

```text
1. describe_schema  or  read dimensions://schema/summary
2. Pick approach:
   - Natural language → search_* / facet_query / analytics (easiest)
   - Boolean concepts or NLP functions → execute_dsl
   - Full control → execute_dsl
3. Refine with filters, facets, or citation_trend / funding_trend
4. Drill down with get_by_* / search_* filters / facet_query
```

For result sets larger than one page, see [Pagination, limits, and usage policy](#pagination-limits-and-usage-policy).

---

## Using natural language (AI assistants)

After Dimensions Analytics MCP is connected, you can ask in plain language. The assistant should pick **structured tools** when possible (not hand-written `execute_dsl`). Example routing is defined in `apps/mcp/src/examples/usage-scenarios.ts` and covered by tests.

| Goal | Example prompt | Tool to use |
|------|----------------|-------------|
| Top papers on a topic | “Find the 20 most-cited publications on CRISPR gene editing since 2020.” | `search_publications` |
| Grants from a funder | “Search NIH grants about cancer immunotherapy started after 2020, limit 25.” | `search_grants` |
| Who works on a topic | “Who are the top researchers working on quantum computing?” | `facet_query` (not `search_researchers`) |
| Find researchers by name | “Search researchers named Jennifer Doudna, sort by publication count.” | `search_researchers` |
| Known paper | “Look up DOI 10.1038/nature12373 and show title, citations, and journal.” | `get_by_doi` |
| Researcher publications | “List recent publications by Jennifer Doudna.” | `search_publications` |
| Institution output | “Show highly cited publications from Stanford University.” | `search_publications` with `research_orgs.id` filter |
| Topic breakdown (with year filter) | “Which journals publish the most machine learning research since 2020?” | `facet_query` |
| Funding leaders | “Which funders have the most grant funding on climate adaptation?” | `aggregate_query` |
| Citations over time | “Citation trend for large language model publications from 2018 to 2024.” | `citation_trend` |
| Build a complex query | “Run a DSL query: include CRISPR or gene editing, exclude animal models, year ≥ 2020.” | `execute_dsl` |

**Routing notes:**

- **`search_publications`** — use `yearFrom`, `sortBy: "total_citations"` (alias), and `limit`; do not put `limit` before `sort` in raw DSL.
- **`search_grants` / `funderOrgName`** — acronyms NCI, NSF, NEH resolve automatically; umbrella labels such as NIH may still match no grants. Discover institute names with **`aggregate_query`** or **`facet_query`** on `facetField: "funder_orgs"`.
- **`search_researchers`** — matches **names** in the researcher index, not research topics. For topic → people, use **`facet_query`** with `entityType: "publications"` and `facetField: "researchers"`.
- **`search_publications` filters** — scope by organization with `research_orgs.id` (GRID id, e.g. `grid.168010.e` for Stanford University) or by researcher with `researchers.id` after a `search_researchers` lookup.
- **`search_organizations`** — institution lookup by name; use GRID id from results when filtering publications or grants.
- **`facet_query`** — supports `query`, `yearFrom` / `yearTo` (publications: `year`; grants: `start_year`), and `filters`. On grants, facet funding organizations with `facetField: "funder_orgs"`.
- **`execute_dsl`** — use for boolean concept groups, classify/extract/similar DSL functions, and queries structured tools cannot express.

### Example tool arguments (natural-language rows)

**Top papers** — `search_publications`:

```json
{
  "query": "CRISPR gene editing",
  "yearFrom": 2020,
  "sortBy": "total_citations",
  "limit": 20,
  "fields": ["id", "title", "doi", "year", "total_citations"]
}
```

**NIH grants** — `search_grants` (specific institute name):

```json
{
  "query": "cancer immunotherapy",
  "startYearFrom": 2020,
  "funderOrgName": "National Cancer Institute",
  "limit": 25
}
```

**Researchers on a topic** — `facet_query`:

```json
{
  "entityType": "publications",
  "facetField": "researchers",
  "query": "quantum computing",
  "limit": 10
}
```

**Journals with year filter** — `facet_query`:

```json
{
  "entityType": "publications",
  "facetField": "journal",
  "query": "machine learning",
  "yearFrom": 2020,
  "limit": 20
}
```

**Citation trend** — `citation_trend`:

```json
{
  "query": "large language model",
  "startYear": 2018,
  "endYear": 2024
}
```

**Funding leaders** — `aggregate_query`:

```json
{
  "entityType": "grants",
  "facetField": "funder_orgs",
  "indicators": ["funding"],
  "query": "climate adaptation",
  "sortBy": "funding",
  "sortOrder": "desc",
  "limit": 10
}
```

**Complex boolean query** — `execute_dsl`:

```json
{
  "dsl": "search publications for \"CRISPR\" or for \"gene editing\" not for \"animal model\" where year >= 2020 return publications[id,title,doi,times_cited] sort by times_cited desc limit 20"
}
```

---

## Structured search tools (`search_*`)

All eight tools share the same core parameters:

| Parameter | Description |
|-----------|-------------|
| `query` | Full-text search terms (Dimensions `for "..."` clause) |
| `limit` | Max rows (default `100`, max `1000`) |
| `skip` | Records to skip (0-based); mutually exclusive with `page` |
| `page` | Page index (0-based); equivalent to `skip = page × limit` |
| `fields` | Optional list of fields to return (see `dimensions://fields/{entity}`) |
| `filters` | Extra `where` clauses (see [Filters](#filters) below) |
| `sortBy` | Sort field; entity-specific enums plus aliases |
| `confirmLargeFetch` | Required for deep pagination — see [usage policy](#pagination-limits-and-usage-policy) |

Entity-specific convenience parameters are documented per tool in the host’s tool list. Examples below use JSON tool arguments (as an MCP client would send them).

### Publications

```json
{
  "query": "CRISPR gene editing",
  "yearFrom": 2020,
  "yearTo": 2024,
  "type": "article",
  "sortBy": "total_citations",
  "limit": 20,
  "fields": ["id", "title", "doi", "year", "total_citations"]
}
```

`total_citations` is an alias resolved to `times_cited` before the query runs.

### Grants

```json
{
  "query": "cancer immunotherapy",
  "startYearFrom": 2020,
  "funderOrgName": "National Cancer Institute",
  "sortBy": "funding_amount_usd",
  "limit": 25,
  "fields": ["id", "title", "funding_usd", "funder_name"]
}
```

`funderOrgName` must match the exact Dimensions funder name (institute level), not the umbrella acronym `NIH`.

### Patents

```json
{
  "query": "solid state battery",
  "filingYearFrom": 2018,
  "filingYearTo": 2023,
  "sortBy": "filing_date",
  "limit": 15
}
```

### Clinical trials

```json
{
  "query": "type 2 diabetes",
  "phase": "Phase 3",
  "overallStatus": "Recruiting",
  "yearFrom": 2020,
  "limit": 10
}
```

### Researchers

```json
{
  "query": "Jennifer Doudna",
  "sortBy": "total_publications",
  "limit": 5,
  "fields": ["id", "first_name", "last_name", "orcid_id", "total_publications"]
}
```

### Filters

Use `filters` for precise `where` conditions. Supported operators include `=`, `!=`, `>`, `<`, `>=`, `<=`, `in`, `is_empty`, and `is_not_empty`.

```json
{
  "query": "genomics",
  "yearFrom": 2020,
  "limit": 50,
  "filters": [
    { "field": "open_access", "operator": "=", "value": true },
    { "field": "total_citations", "operator": ">=", "value": 100 }
  ]
}
```

Field names in `filters` can use aliases; they are resolved like `fields` and `sortBy`.

Truncated responses include `truncated`, `truncationWarning`, `pagination` (with `nextSkip`, `estimatedRequestsToFetchAll`, etc.), and sometimes `largeResultWarning` / `policyNotice`.

---

## Pagination, limits, and usage policy

Structured `search_*` tools return at most **1000** rows per call (default **100**). Official caps are documented in [Dimensions usage policy](https://docs.dimensions.ai/dsl/usagepolicy.html) and exposed as `dimensions://schema/limits`:

| Limit | Value |
|-------|-------|
| Rows per request | 1000 |
| Max paginated records | 50,000 (50 pages × 1000) |
| Facet buckets | 1000 (no pagination) |
| Client rate budget | 30 requests/min (see [REFERENCE.md](./REFERENCE.md)) |

**Choose an approach:**

| Goal | Tool | Notes |
|------|------|-------|
| Browse one page in chat | `search_*` with `skip` or `page` | Default for discovery |
| Multi-page summary | `fetch_search_pages` `mode: "aggregate"` | IDs, counts, funding totals — no full rows |
| Export to disk | `fetch_search_pages` `mode: "file"` | JSONL or CSV via `outputPath` |

Read `dimensions://schema/policy` for the full machine-readable policy. The server enforces reasonable-use guardrails:

- **Warnings** when `totalCount > 10,000` — `largeResultWarning` and `policyNotice` in responses
- **`confirmLargeFetch: true`** for deep pagination (`skip ≥ 5000`, `page ≥ 5`, or `limit = 1000` with `skip > 0`) on `search_*`, `fetch_search_pages`, and `execute_dsl`
- **Batch pulls** — `confirmLargeFetch` also required when `maxPages > 5` or planned records > 5,000
- **Facets** — no `skip`; narrow with filters instead
- **File export** — bounded, task-sized analysis only; not bulk mirroring of Dimensions data

Narrow filters and `facet_query` before large pulls.

### Multi-page fetch (`fetch_search_pages`)

Same filters and convenience parameters as `search_*`, plus batch controls. Modes:

- **`page`** (default) — one page in the tool response
- **`aggregate`** — fetch multiple pages; return summary only (IDs, counts, grant funding totals)
- **`file`** — stream to `outputPath` as JSONL or CSV (`outputFormat` optional; `.csv` extension implies CSV)

**Next page in chat:**

```json
{
  "entityType": "publications",
  "mode": "page",
  "query": "machine learning",
  "page": 1,
  "pageSize": 100
}
```

**Aggregate IDs across three pages:**

```json
{
  "entityType": "grants",
  "mode": "aggregate",
  "query": "cancer immunotherapy",
  "pageSize": 1000,
  "maxPages": 3
}
```

**CSV export** (large pulls need `confirmLargeFetch: true`):

```json
{
  "entityType": "publications",
  "mode": "file",
  "query": "CRISPR",
  "outputPath": "/tmp/crispr.csv",
  "fields": ["id", "title", "year"],
  "maxPages": 10,
  "confirmLargeFetch": true
}
```

File mode writes a `.meta.json` sidecar beside the output for resume (`resumeFromMeta: true`).

---

## Lookup tools

### By DOI

```json
{
  "doi": "10.1038/nature12373",
  "fields": ["id", "title", "abstract", "times_cited", "year", "journal"]
}
```

Tool: `get_by_doi`

### By PubMed ID

```json
{
  "pmid": "12345678",
  "fields": ["id", "title", "doi", "pmid"]
}
```

Tool: `get_by_pmid`

### By Dimensions ID (any entity)

```json
{
  "entityType": "publications",
  "id": "pub.1138234981",
  "fields": ["id", "title", "doi"]
}
```

Tool: `get_by_id` — `entityType` is one of: `publications`, `grants`, `researchers`, `patents`, `clinical_trials`, `datasets`, `policy_documents`, `organizations`.

For highly cited recent work in a topic, use `search_publications` with `yearFrom`, `sortBy: "total_citations"`, and a suitable `limit`.

---

## Analytics

### Facet distribution

“How are results spread across a dimension?” (journals, years, funders, etc.)

```json
{
  "entityType": "publications",
  "facetField": "journal",
  "query": "CRISPR",
  "yearFrom": 2020,
  "limit": 20
}
```

Tool: `facet_query` — optional `yearFrom` / `yearTo` and `filters` narrow results before faceting. Use `dimensions://fields/{entityType}` for valid facet fields; on grants, use `facetField: "funder_orgs"`.

### Aggregated metrics per bucket

```json
{
  "entityType": "publications",
  "facetField": "journal",
  "indicators": ["citations_total", "count"],
  "query": "machine learning",
  "sortBy": "citations_total",
  "sortOrder": "desc",
  "limit": 10
}
```

Tool: `aggregate_query` — `indicators` must match metrics from describe schema for that entity (see `describe_schema` or `dimensions://schema/sources/{name}`).

### Citation trend by year

```json
{
  "query": "CRISPR gene editing",
  "startYear": 2015,
  "endYear": 2024
}
```

Tool: `citation_trend`

### Funding trend by year

```json
{
  "query": "cancer research",
  "startYear": 2010,
  "endYear": 2024,
  "currency": "USD"
}
```

Tool: `funding_trend`

---

## Drill down (without profile tools)

Use structured search and lookup instead of dedicated profile aggregators.

**Publications by researcher** — `search_publications`:

```json
{
  "query": "Jennifer Doudna",
  "sortBy": "total_citations",
  "limit": 10,
  "fields": ["id", "title", "year", "total_citations", "journal"]
}
```

**Publications by organization** — `search_publications` with GRID id filter:

```json
{
  "filters": [{ "field": "research_orgs.id", "operator": "=", "value": "grid.168010.e" }],
  "sortBy": "total_citations",
  "limit": 25,
  "fields": ["id", "title", "year", "total_citations"]
}
```

**Grants by organization** — `search_grants` with the same `research_orgs.id` filter.

**Top researchers at an org** — `facet_query` with `entityType: "publications"`, `facetField: "researchers"`, and `filters` on `research_orgs.id`.

**Topic analytics** — `facet_query`, `aggregate_query`, `citation_trend`, or `funding_trend` instead of `concept_profile`.

**Linked entities** — `get_by_id` plus follow-up `search_*` / `execute_dsl` using structural link fields from describe schema.

---

## Raw DSL (`execute_dsl`)

Use when structured tools are not enough: complex joins of return clauses, `skip`, function calls, or describe commands.

### Simple search

Use one line, or join lines in this order (`sort by` before `limit`):

```text
search publications for "machine learning" where year >= 2020 and times_cited >= 50 return publications[id+title+doi+times_cited] sort by times_cited desc limit 25
```

Wrong (syntax error): `... return publications limit 25 sort times_cited desc` — missing `by`, and `limit` must come after `sort by`.

### Facet-only (no row payload)

```text
search publications for "quantum computing"
where year >= 2020
return publications facet journal limit 20
```

### Pagination

Prefer `search_*` or `fetch_search_pages` for paginated entity search. In raw DSL, `limit` must come after `sort by`:

```text
search grants for "climate adaptation"
return grants[id+title+funding_usd]
sort by funding_usd desc
limit 100 skip 100
```

Deep pagination in `execute_dsl` requires `confirmLargeFetch: true` (see [usage policy](#pagination-limits-and-usage-policy)). Facet returns cannot use `skip`.

### Grants aggregation

```text
search grants for "renewable energy"
where start_year >= 2018
return funders aggregate funding_usd
limit 15
```

### Describe and NLP functions

```text
describe version
```

```text
describe schema
```

```text
extract_concepts(text: "CRISPR gene editing enables precise DNA modification")
```

```text
classify(text: "Stem cell therapy for diabetes", system: "for")
```

More patterns: MCP resource `dimensions://examples` and [DSL docs](https://docs.dimensions.ai/dsl/).

---

## Entity resolution tools

| Tool | Example use |
|------|-------------|
| `extract_affiliations` | Resolve affiliation strings to ROR/GRID IDs |
| `extract_grants` | Resolve grant numbers to grant records |

Exact argument shapes are in the MCP tool schema in your host (Cursor, Claude Desktop, etc.).

Classification, concept extraction, and similarity search remain available via **`execute_dsl`** using DSL functions such as `classify()`, `extract_concepts()`, and `similar_documents()` — see [Raw DSL](#raw-dsl-execute_dsl) and `dimensions://examples`.

---

## Schema tools and resources

| Tool / resource | Purpose |
|-----------------|--------|
| `describe_schema` | Compact summary by default (`full=true` for raw describe) |
| `refresh_schema` | Force live reload (updates cache when configured) |
| `dimensions://schema/summary` | Compact catalog overview — use on cold-start |
| `dimensions://schema` | Full raw describe payload |
| `dimensions://schema/version` | DSL version string |
| `dimensions://schema/limits` | Numeric caps (`maxLimit`, `maxPages`, etc.) |
| `dimensions://schema/policy` | Reasonable-use rules and MCP guardrails |
| `dimensions://schema/sources/{name}` | Fields, facets, metrics for a source |
| `dimensions://fields/{entityType}` | Filterable/facet fields + alias hints |
| `dimensions://examples` | All curated example queries |
| `dimensions://examples/{source}` | Per-source DSL examples (e.g. `publications`, `grants`) |

---

## All MCP tools

| Tool | Description |
| ---- | ----------- |
| `search_publications` | Search research articles, preprints, and books with citation metrics |
| `search_grants` | Search research grants and funding awards |
| `search_researchers` | Search researcher profiles with publication counts and affiliations |
| `search_patents` | Search patents with assignee and filing information |
| `search_clinical_trials` | Search clinical trials by phase, condition, or status |
| `search_datasets` | Search research datasets and repositories |
| `search_policy_documents` | Search policy briefs and government documents |
| `search_organizations` | Search universities, research institutes, and companies |
| `fetch_search_pages` | Paginated / batch search (page, aggregate, JSONL/CSV export) — **local stdio only** |
| `get_by_doi` | Retrieve publication by DOI |
| `get_by_pmid` | Retrieve publication by PubMed ID |
| `get_by_id` | Retrieve any entity by Dimensions ID |
| `aggregate_query` | Numeric aggregation (sum/avg/count) over any entity with grouping |
| `facet_query` | Facet counts for top values of any field |
| `citation_trend` | Citation counts over time for a topic or entity |
| `funding_trend` | Funding awarded over time for a topic or entity |
| `extract_affiliations` | Resolve organization affiliations to GRID/ROR identifiers |
| `extract_grants` | Resolve grant numbers to full grant records |
| `execute_dsl` | Execute raw Dimensions DSL queries (classify, extract concepts, similarity, KWQ, and more) |
| `describe_schema` | Summarize live describe schema (sources, entities, limits) |
| `refresh_schema` | Reload describe schema from the API |

---

## Tips

- **Start structured, escalate to DSL** — `search_*` covers most discovery; use `fetch_search_pages` for multi-page pulls and `execute_dsl` only for advanced returns.
- **Check truncation** — when `truncated` is true, use `pagination.nextSkip` or `page` on the next call; read `policyNotice` before large exports.
- **Rate limits** — default client budget is 30 requests/minute; see [REFERENCE.md](./REFERENCE.md).
- **Errors** — invalid field names or DSL syntax surface as API errors with messages; cross-check `dimensions://fields/...`.

## See also

- [MCP field aliases](./MCP_FIELD_ALIASES.md)
- [Dimensions DSL (official)](https://docs.dimensions.ai/dsl/)
