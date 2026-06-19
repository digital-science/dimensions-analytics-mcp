/**
 * Per-entity search tool metadata (descriptions, convenience filters, sort hints).
 * @module mcp/tools/search-entity-metadata
 */

import { z } from "zod";
import type { QueryBuilder, StructuredEntityType } from "../../dsl/index.js";
import { resolveFunderOrgName } from "../funder-org-names.js";

/** Convenience filters applied before extended `filters`. */
export type ConvenienceFilterApplier = (
  builder: QueryBuilder,
  args: Record<string, unknown>,
) => void;

/** Static configuration for one structured search entity. */
export interface SearchEntityMetadata {
  readonly source: StructuredEntityType;
  readonly description: string;
  readonly applyConvenienceFilters: ConvenienceFilterApplier;
  readonly extraInputSchema: Record<string, z.ZodTypeAny>;
}

const noop: ConvenienceFilterApplier = () => {};

function yearRange(fromKey: string, toKey: string, field: string): ConvenienceFilterApplier {
  return (builder, args) => {
    const from = args[fromKey];
    const to = args[toKey];
    if (typeof from === "number") {
      builder.where(field, ">=", from);
    }
    if (typeof to === "number") {
      builder.where(field, "<=", to);
    }
  };
}

/** Metadata for all structured search tools. */
export const SEARCH_ENTITY_METADATA: readonly SearchEntityMetadata[] = [
  {
    source: "publications",
    description:
      "Search research publications in the Dimensions database. Returns articles, preprints, books, and other scholarly works with citation metrics, author information, and metadata.",
    applyConvenienceFilters: (builder, args) => {
      yearRange("yearFrom", "yearTo", "year")(builder, args);
      if (typeof args.type === "string") {
        builder.where("type", "=", args.type);
      }
    },
    extraInputSchema: {
      yearFrom: z
        .number()
        .int()
        .optional()
        .describe("Filter publications from this year (inclusive)"),
      yearTo: z
        .number()
        .int()
        .optional()
        .describe("Filter publications up to this year (inclusive)"),
      type: z
        .enum(["article", "chapter", "proceeding", "monograph", "preprint", "book"])
        .optional()
        .describe("Filter by publication type"),
      sortBy: z
        .enum([
          "times_cited",
          "total_citations",
          "recent_citations",
          "relative_citation_ratio",
          "field_citation_ratio",
          "citation_ratio",
          "altmetric",
          "altmetric_score",
          "year",
          "date",
        ])
        .optional()
        .describe(
          "Sort results by this field (total_citations = times_cited, citation_ratio = field_citation_ratio, altmetric_score = altmetric)",
        ),
    },
  },
  {
    source: "grants",
    description:
      "Search research grants and funding awards in the Dimensions database. Returns grant information including funding amounts, funders, and research organizations. " +
      "funderOrgName must match an exact Dimensions funder name (acronyms like NCI and NSF are resolved automatically). " +
      "Umbrella labels such as NIH often match no grants — discover institute names with facet_query or aggregate_query on facetField funder_orgs.",
    applyConvenienceFilters: (builder, args) => {
      yearRange("startYearFrom", "startYearTo", "start_year")(builder, args);
      if (typeof args.funderOrgName === "string") {
        builder.where("funder_org_name", "=", resolveFunderOrgName(args.funderOrgName));
      }
    },
    extraInputSchema: {
      startYearFrom: z
        .number()
        .int()
        .optional()
        .describe("Filter grants starting from this year (inclusive)"),
      startYearTo: z
        .number()
        .int()
        .optional()
        .describe("Filter grants starting up to this year (inclusive)"),
      funderOrgName: z
        .string()
        .optional()
        .describe(
          "Filter by funder organization name. Acronyms NCI, NSF, NEH resolve automatically; use facet_query/aggregate_query on funder_orgs to discover exact names.",
        ),
      sortBy: z
        .enum([
          "funding_usd",
          "funding_eur",
          "funding_amount_usd",
          "funding_amount_eur",
          "start_year",
          "start_date",
          "end_date",
        ])
        .optional()
        .describe(
          "Sort results by this field (funding_amount_usd = funding_usd, funding_amount_eur = funding_eur)",
        ),
    },
  },
  {
    source: "researchers",
    description:
      "Search researcher profiles by name in the Dimensions database. The query matches researcher names, not research topics — " +
      "for topic→researcher discovery use facet_query with entityType publications and facetField researchers.",
    applyConvenienceFilters: noop,
    extraInputSchema: {
      sortBy: z
        .enum(["total_publications", "total_grants"])
        .optional()
        .describe("Sort results by this field"),
    },
  },
  {
    source: "patents",
    description:
      "Search patents in the Dimensions database. Returns patent information including titles, abstracts, assignees, and filing dates.",
    applyConvenienceFilters: (builder, args) => {
      yearRange("filingYearFrom", "filingYearTo", "year")(builder, args);
    },
    extraInputSchema: {
      filingYearFrom: z
        .number()
        .int()
        .optional()
        .describe("Filter patents filed from this year (inclusive)"),
      filingYearTo: z
        .number()
        .int()
        .optional()
        .describe("Filter patents filed up to this year (inclusive)"),
      sortBy: z
        .enum(["filing_date", "publication_date", "granted_date"])
        .optional()
        .describe("Sort results by this field"),
    },
  },
  {
    source: "clinical_trials",
    description:
      "Search clinical trials in the Dimensions database. Returns trial information including phases, conditions studied, and status.",
    applyConvenienceFilters: (builder, args) => {
      if (typeof args.phase === "string") {
        builder.where("phase", "=", args.phase);
      }
      if (typeof args.overallStatus === "string") {
        builder.where("overall_status", "=", args.overallStatus);
      }
      yearRange("yearFrom", "yearTo", "year")(builder, args);
    },
    extraInputSchema: {
      phase: z.string().optional().describe("Filter by trial phase (e.g., 'Phase 3')"),
      overallStatus: z
        .string()
        .optional()
        .describe("Filter by trial status (e.g., 'Completed', 'Recruiting')"),
      yearFrom: z
        .number()
        .int()
        .optional()
        .describe("Filter trials starting from this year (inclusive)"),
      yearTo: z
        .number()
        .int()
        .optional()
        .describe("Filter trials starting up to this year (inclusive)"),
      sortBy: z.enum(["start_date"]).optional().describe("Sort results by this field"),
    },
  },
  {
    source: "datasets",
    description:
      "Search research datasets in the Dimensions database. Returns dataset information including descriptions, repositories, and associated publications.",
    applyConvenienceFilters: (builder, args) => {
      yearRange("yearFrom", "yearTo", "year")(builder, args);
      if (typeof args.repository === "string") {
        builder.where("repository", "=", args.repository);
      }
    },
    extraInputSchema: {
      yearFrom: z.number().int().optional().describe("Filter datasets from this year (inclusive)"),
      yearTo: z.number().int().optional().describe("Filter datasets up to this year (inclusive)"),
      repository: z.string().optional().describe("Filter by repository name"),
      sortBy: z.enum(["year"]).optional().describe("Sort results by this field"),
    },
  },
  {
    source: "policy_documents",
    description:
      "Search policy documents in the Dimensions database. Returns policy briefs, reports, and government documents that cite research.",
    applyConvenienceFilters: (builder, args) => {
      yearRange("yearFrom", "yearTo", "year")(builder, args);
    },
    extraInputSchema: {
      yearFrom: z.number().int().optional().describe("Filter documents from this year (inclusive)"),
      yearTo: z.number().int().optional().describe("Filter documents up to this year (inclusive)"),
      sortBy: z.enum(["year"]).optional().describe("Sort results by this field"),
    },
  },
  {
    source: "organizations",
    description:
      "Search research organizations in the Dimensions database. Returns universities, research institutes, hospitals, and companies with research output.",
    applyConvenienceFilters: (builder, args) => {
      if (typeof args.orgType === "string") {
        builder.where("types", "=", args.orgType);
      }
      if (typeof args.country === "string") {
        builder.where("country_name", "=", args.country);
      }
    },
    extraInputSchema: {
      orgType: z
        .string()
        .optional()
        .describe("Filter by organization type (e.g., 'Education', 'Healthcare', 'Company')"),
      country: z
        .string()
        .optional()
        .describe("Filter by country (e.g., 'United States', 'Germany')"),
      sortBy: z.enum(["name"]).optional().describe("Sort results by this field"),
    },
  },
];
