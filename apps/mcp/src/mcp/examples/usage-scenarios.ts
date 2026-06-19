/**
 * Tool routing for natural-language prompts in docs/USAGE.md.
 * @module examples/usage-scenarios
 */

export interface UsageScenario {
  /** Stable id for tests */
  id: string;
  /** Short goal label (matches USAGE table) */
  goal: string;
  /** Example user prompt */
  prompt: string;
  /** Structured MCP tool agents should call */
  tool: string;
  /** Tool arguments (validated in usage-scenarios.test.ts) */
  args: Record<string, unknown>;
  /** Substrings expected in DSL passed to rawQuery (when applicable) */
  dslContains?: string[];
}

export const USAGE_SCENARIOS: readonly UsageScenario[] = [
  {
    id: "top-publications",
    goal: "Top papers on a topic",
    prompt: "Find the 20 most-cited publications on CRISPR gene editing since 2020.",
    tool: "search_publications",
    args: {
      query: "CRISPR gene editing",
      yearFrom: 2020,
      sortBy: "total_citations",
      limit: 20,
      fields: ["id", "title", "doi", "year", "total_citations"],
    },
    dslContains: [
      "search publications",
      "CRISPR gene editing",
      "year >= 2020",
      "sort by times_cited desc",
      "limit 20",
    ],
  },
  {
    id: "nih-grants",
    goal: "Grants from a funder",
    prompt: "Search NIH grants about cancer immunotherapy started after 2020, limit 25.",
    tool: "search_grants",
    args: {
      query: "cancer immunotherapy",
      startYearFrom: 2020,
      funderOrgName: "National Cancer Institute",
      limit: 25,
      fields: ["id", "title", "funding_usd", "funder_name", "start_year"],
    },
    dslContains: [
      "search grants",
      "cancer immunotherapy",
      "start_year >= 2020",
      'funder_org_name = "National Cancer Institute"',
      "limit 25",
    ],
  },
  {
    id: "researchers-by-topic",
    goal: "Who works on a topic",
    prompt: "Who are the top researchers working on quantum computing?",
    tool: "facet_query",
    args: {
      entityType: "publications",
      facetField: "researchers",
      query: "quantum computing",
      limit: 10,
    },
    dslContains: ["search publications", "quantum computing", "return researchers"],
  },
  {
    id: "researchers-by-name",
    goal: "Find researchers by name",
    prompt: "Search researchers named Jennifer Doudna, sort by publication count.",
    tool: "search_researchers",
    args: {
      query: "Jennifer Doudna",
      sortBy: "total_publications",
      limit: 10,
      fields: ["id", "first_name", "last_name", "total_publications"],
    },
    dslContains: ["search researchers", "Jennifer Doudna", "sort by total_publications"],
  },
  {
    id: "doi-lookup",
    goal: "Known paper",
    prompt: "Look up DOI 10.1038/nature12373 and show title, citations, and journal.",
    tool: "get_by_doi",
    args: {
      doi: "10.1038/nature12373",
      fields: ["id", "title", "times_cited", "journal"],
    },
    dslContains: ["10.1038/nature12373"],
  },
  {
    id: "author-publications",
    goal: "Researcher publications",
    prompt: "List recent publications by Jennifer Doudna.",
    tool: "search_publications",
    args: {
      query: "Jennifer Doudna",
      sortBy: "total_citations",
      limit: 10,
      fields: ["id", "title", "year", "total_citations", "journal"],
    },
    dslContains: ["search publications", "Jennifer Doudna", "limit 10"],
  },
  {
    id: "org-publications",
    goal: "Institution output",
    prompt: "Show highly cited publications from Stanford University.",
    tool: "search_publications",
    args: {
      filters: [{ field: "research_orgs.id", operator: "=", value: "grid.168010.e" }],
      sortBy: "total_citations",
      limit: 25,
      fields: ["id", "title", "year", "total_citations"],
    },
    dslContains: ['research_orgs.id = "grid.168010.e"', "sort by times_cited"],
  },
  {
    id: "facet-journals-since-year",
    goal: "Topic breakdown",
    prompt: "Which journals publish the most machine learning research since 2020?",
    tool: "facet_query",
    args: {
      entityType: "publications",
      facetField: "journal",
      query: "machine learning",
      yearFrom: 2020,
      limit: 20,
    },
    dslContains: ["machine learning", "year >= 2020", "return journal"],
  },
  {
    id: "funding-leaders",
    goal: "Funding leaders",
    prompt: "Which funders have the most grant funding on climate adaptation?",
    tool: "aggregate_query",
    args: {
      entityType: "grants",
      facetField: "funder_orgs",
      indicators: ["funding"],
      query: "climate adaptation",
      sortBy: "funding",
      sortOrder: "desc",
      limit: 10,
    },
    dslContains: ["search grants", "climate adaptation", "return funder_orgs aggregate funding"],
  },
  {
    id: "citation-trend",
    goal: "Citations over time",
    prompt: "Citation trend for large language model publications from 2018 to 2024.",
    tool: "citation_trend",
    args: {
      query: "large language model",
      startYear: 2018,
      endYear: 2024,
    },
    dslContains: ["large language model", "citations_per_year(2018, 2024)"],
  },
  {
    id: "build-complex-query",
    goal: "Build a complex query",
    prompt:
      "Run a DSL query for publications: include CRISPR or gene editing, exclude animal models, year ≥ 2020.",
    tool: "execute_dsl",
    args: {
      dsl: 'search publications for "CRISPR" or for "gene editing" not for "animal model" where year >= 2020 return publications[id,title,doi,times_cited] sort by times_cited desc limit 20',
    },
    dslContains: [
      "search publications",
      "CRISPR",
      "gene editing",
      "animal model",
      "year >= 2020",
      "limit 20",
    ],
  },
] as const;
