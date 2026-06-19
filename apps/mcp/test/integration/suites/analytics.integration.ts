/**
 * Eval suite for analytics tools.
 * Tests facet queries, aggregations, and trend analysis against the live API.
 * @module test/integration/suites/analytics
 */

import { arrayMinLength, hasField, isSuccess } from "../assertions.js";
import type { EvalSuite } from "../types.js";

export const analyticsSuite: EvalSuite = {
  name: "analytics",
  description: "Facet queries, aggregations, and trend analysis",
  cases: [
    {
      name: "facet query: publications by year",
      tool: "facet_query",
      args: {
        entityType: "publications",
        facetField: "year",
        query: "artificial intelligence",
        limit: 10,
      },
      assertions: [isSuccess(), arrayMinLength("buckets", 1)],
    },
    {
      name: "facet query: grants by funder",
      tool: "facet_query",
      args: {
        entityType: "grants",
        facetField: "funder_orgs",
        query: "climate change",
        limit: 10,
      },
      assertions: [isSuccess(), arrayMinLength("buckets", 1)],
      timeout: 60_000,
    },
    {
      name: "aggregate query: publications by year with citation sum",
      tool: "aggregate_query",
      args: {
        entityType: "publications",
        facetField: "year",
        indicators: ["citations_total"],
        query: "deep learning",
        limit: 10,
      },
      assertions: [isSuccess(), arrayMinLength("buckets", 1)],
      timeout: 60_000,
    },
    {
      name: "citation trend for COVID-19",
      tool: "citation_trend",
      args: {
        query: "COVID-19",
        startYear: 2020,
        endYear: 2024,
      },
      assertions: [isSuccess(), hasField("citationsPerYear")],
    },
    {
      name: "funding trend for AI research",
      tool: "funding_trend",
      args: {
        query: "artificial intelligence",
        startYear: 2019,
        endYear: 2024,
        currency: "USD",
      },
      assertions: [isSuccess(), hasField("fundingPerYear")],
    },
  ],
};
