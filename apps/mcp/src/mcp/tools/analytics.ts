/**
 * Analytics tools for the MCP server.
 * Provides tools for facet distribution analysis, metric aggregation, and time-series trends.
 * @module mcp/tools/analytics
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { Currency, DimensionsClient, EntityType } from "../../dsl/index.js";
import {
  ExtendedWhereFilterSchema,
  type FacetFieldConfig,
  parseFacetResponse,
  SUPPORTED_CURRENCIES,
} from "../../dsl/index.js";
import { resolveFacetFieldName, withFieldAliases } from "../middleware/field-aliases.js";
import type { SchemaStore } from "../schema/index.js";
import { formatErrorResult, formatToolResult, READ_ONLY_API_ANNOTATIONS } from "../utils.js";
import { applyAnalyticsFilters } from "./analytics-filters.js";

/** API may return year→value map or an array; normalize for MCP output schemas. */
function normalizeYearSeries(
  data: unknown,
  valueKey: "count" | "funding",
): Array<Record<string, unknown>> {
  if (Array.isArray(data)) {
    return data as Array<Record<string, unknown>>;
  }
  if (data && typeof data === "object") {
    return Object.entries(data as Record<string, number>)
      .map(([year, value]) => ({ year: Number(year), [valueKey]: value }))
      .sort((a, b) => (a.year as number) - (b.year as number));
  }
  return [];
}

/**
 * Zod enum of structured entity types from the loaded schema.
 * @param schemaStore - Loaded describe schema
 * @returns Entity type enum for tool input schemas
 */
function entityTypeEnum(schemaStore: SchemaStore) {
  const types = schemaStore.structuredEntityTypes();
  if (types.length === 0) {
    return z.string().min(1).describe("Entity type (no sources loaded in schema)");
  }
  return z
    .enum(types as [EntityType, ...EntityType[]])
    .describe("The entity type to analyze (e.g., 'publications', 'grants', 'patents')");
}

/**
 * Validates a facet field against describe schema.
 * @param schemaStore - Loaded schema
 * @param entity - Entity type
 * @param facetField - Facet field name
 */
function assertFacetField(schemaStore: SchemaStore, entity: string, facetField: string): void {
  const valid = schemaStore.facetFields(entity);
  if (!valid.includes(facetField)) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `Invalid facet field "${facetField}" for entity "${entity}". Valid fields: ${valid.join(", ") || "(none)"}`,
    );
  }
}

/**
 * Validates aggregation indicators against describe schema.
 * @param schemaStore - Loaded schema
 * @param entity - Entity type
 * @param indicators - Metric names
 */
function assertIndicators(schemaStore: SchemaStore, entity: string, indicators: string[]): void {
  const valid = new Set(schemaStore.metrics(entity));
  const invalid = indicators.filter((name) => !valid.has(name));
  if (invalid.length > 0) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `Invalid indicator(s) for entity "${entity}": ${invalid.join(", ")}. Valid metrics: ${[...valid].join(", ") || "(none)"}`,
    );
  }
}

/**
 * Builds facet field hint text from describe schema.
 * @param schemaStore - Loaded schema
 * @returns Description fragment
 */
function facetFieldsDescription(schemaStore: SchemaStore): string {
  return schemaStore
    .structuredEntityTypes()
    .map((entity) => `${entity}: ${schemaStore.facetFieldsHint(entity)}`)
    .join(". ");
}

/**
 * Builds metrics hint text from describe schema.
 * @param schemaStore - Loaded schema
 * @returns Description fragment
 */
function metricsDescription(schemaStore: SchemaStore): string {
  return schemaStore
    .structuredEntityTypes()
    .map((entity) => `${entity}: ${schemaStore.metricsHint(entity)}`)
    .join(". ");
}

/**
 * Registers all analytics tools with the MCP server.
 * @param server - MCP server instance
 * @param client - Dimensions client instance
 * @param schemaStore - Loaded describe schema
 */
export function registerAnalyticsTools(
  server: McpServer,
  client: DimensionsClient,
  schemaStore: SchemaStore,
): void {
  const facetHint = facetFieldsDescription(schemaStore);
  const metricsHint = metricsDescription(schemaStore);
  const entityTypeSchema = entityTypeEnum(schemaStore);

  // Facet Query
  server.registerTool(
    "facet_query",
    {
      description:
        "Distribution analysis across entity dimensions. Returns facet buckets showing how records " +
        "are distributed across a categorical field. Example: 'What journals publish the most CRISPR research?'",
      inputSchema: {
        entityType: entityTypeSchema,
        facetField: z
          .string()
          .min(1)
          .describe(`Field to facet on. Valid fields by entity: ${facetHint}`),
        query: z
          .string()
          .min(1)
          .optional()
          .describe(
            "Optional search query to filter records before faceting (e.g., 'CRISPR gene editing')",
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .default(20)
          .describe("Maximum number of facet buckets to return (default 20, max 100)"),
        yearFrom: z
          .number()
          .int()
          .optional()
          .describe("Filter records from this year (publications: year; grants: start_year)"),
        yearTo: z
          .number()
          .int()
          .optional()
          .describe("Filter records up to this year (publications: year; grants: start_year)"),
        filters: z
          .array(ExtendedWhereFilterSchema)
          .optional()
          .describe("Additional where-clause filters before faceting"),
      },
      outputSchema: {
        entityType: z.string().describe("Entity type analyzed"),
        facetField: z.string().describe("Field faceted on"),
        totalBuckets: z.number().describe("Number of facet buckets returned"),
        buckets: z.array(z.record(z.string(), z.unknown())).describe("Facet bucket distribution"),
      },
      annotations: READ_ONLY_API_ANNOTATIONS,
    },
    withFieldAliases(
      {
        entitySource: { kind: "dynamic", argName: "entityType" },
        filterArrayArgs: ["filters"],
      },
      async (args) => {
        try {
          const facetField = resolveFacetFieldName(
            args.entityType as EntityType,
            args.facetField as string,
          );
          assertFacetField(schemaStore, args.entityType, facetField);
          const builder = client.createQueryBuilder().search(args.entityType as EntityType);
          if (args.query) {
            builder.for(args.query);
          }
          applyAnalyticsFilters(builder, args.entityType as EntityType, args);
          builder.returnFacet(facetField, { limit: args.limit });
          const response = (await client.rawQuery(builder.build())) as Record<string, unknown>;
          const facetConfigs: Record<string, FacetFieldConfig> = {
            [facetField]: {},
          };
          const parsed = parseFacetResponse(response, args.entityType, facetConfigs, {
            includeRaw: false,
          });
          const facets = parsed.facets[facetField];
          return formatToolResult({
            entityType: args.entityType,
            facetField,
            totalBuckets: facets.buckets.length,
            buckets: facets.buckets,
          });
        } catch (error) {
          return formatErrorResult(error);
        }
      },
    ),
  );

  // Aggregate Query
  server.registerTool(
    "aggregate_query",
    {
      description:
        "Metric aggregation on facet buckets. Returns facet buckets enriched with aggregated indicator " +
        "values. Example: 'Which funders have the highest average citation ratio?'",
      inputSchema: {
        entityType: entityTypeSchema,
        facetField: z
          .string()
          .min(1)
          .describe(`Field to facet on. Valid fields by entity: ${facetHint}`),
        indicators: z
          .array(z.string().min(1))
          .min(1)
          .describe(`Aggregation indicators per bucket. Valid metrics by entity: ${metricsHint}`),
        query: z
          .string()
          .min(1)
          .optional()
          .describe("Optional search query to filter records before aggregating"),
        sortBy: z
          .string()
          .optional()
          .describe(
            "Field to sort buckets by (must be 'count' or one of the specified indicators)",
          ),
        sortOrder: z.enum(["asc", "desc"]).optional().describe("Sort direction — 'asc' or 'desc'"),
        limit: z
          .number()
          .int()
          .min(1)
          .default(20)
          .describe("Maximum number of facet buckets to return (default 20)"),
        yearFrom: z
          .number()
          .int()
          .optional()
          .describe("Filter records from this year (publications: year; grants: start_year)"),
        yearTo: z
          .number()
          .int()
          .optional()
          .describe("Filter records up to this year (publications: year; grants: start_year)"),
        filters: z
          .array(ExtendedWhereFilterSchema)
          .optional()
          .describe("Additional where-clause filters before aggregating"),
      },
      outputSchema: {
        entityType: z.string().describe("Entity type analyzed"),
        facetField: z.string().describe("Field faceted on"),
        indicators: z.array(z.string()).describe("Aggregation indicators computed"),
        totalBuckets: z.number().describe("Number of facet buckets returned"),
        buckets: z
          .array(z.record(z.string(), z.unknown()))
          .describe("Facet buckets with aggregated values"),
      },
      annotations: READ_ONLY_API_ANNOTATIONS,
    },
    withFieldAliases(
      {
        entitySource: { kind: "dynamic", argName: "entityType" },
        fieldStringArgs: ["sortBy"],
        fieldArrayArgs: ["indicators"],
        filterArrayArgs: ["filters"],
      },
      async (args) => {
        try {
          const facetField = resolveFacetFieldName(
            args.entityType as EntityType,
            args.facetField as string,
          );
          assertFacetField(schemaStore, args.entityType, facetField);
          assertIndicators(schemaStore, args.entityType, args.indicators);
          const builder = client.createQueryBuilder().search(args.entityType as EntityType);
          if (args.query) {
            builder.for(args.query);
          }
          applyAnalyticsFilters(builder, args.entityType as EntityType, args);
          builder.returnAggregate(facetField, args.indicators, {
            sortBy: args.sortBy,
            sortOrder: args.sortOrder,
            limit: args.limit,
          });
          const response = (await client.rawQuery(builder.build())) as Record<string, unknown>;
          const facetConfigs: Record<string, FacetFieldConfig> = {
            [facetField]: { indicators: args.indicators },
          };
          const parsed = parseFacetResponse(response, args.entityType, facetConfigs, {
            includeRaw: false,
          });
          const facets = parsed.facets[facetField];
          return formatToolResult({
            entityType: args.entityType,
            facetField,
            indicators: args.indicators,
            totalBuckets: facets.buckets.length,
            buckets: facets.buckets,
          });
        } catch (error) {
          return formatErrorResult(error);
        }
      },
    ),
  );

  // Citation Trend
  server.registerTool(
    "citation_trend",
    {
      description:
        "Year-by-year citation counts for a topic. Returns annual citation totals for publications " +
        "matching the query over the specified year range.",
      inputSchema: {
        query: z
          .string()
          .min(1)
          .describe("Search query to identify publications (e.g., 'CRISPR gene editing')"),
        startYear: z
          .number()
          .int()
          .min(1900)
          .max(2100)
          .describe("First year of the time range (inclusive)"),
        endYear: z
          .number()
          .int()
          .min(1900)
          .max(2100)
          .describe("Last year of the time range (inclusive)"),
      },
      outputSchema: {
        query: z.string().describe("Search query used"),
        startYear: z.number().describe("First year of range"),
        endYear: z.number().describe("Last year of range"),
        citationsPerYear: z
          .array(z.record(z.string(), z.unknown()))
          .describe("Annual citation totals"),
      },
      annotations: READ_ONLY_API_ANNOTATIONS,
    },
    async (args) => {
      try {
        if (args.startYear > args.endYear) {
          throw new McpError(
            ErrorCode.InvalidParams,
            `startYear (${args.startYear}) must be ≤ endYear (${args.endYear})`,
          );
        }
        const dsl = client
          .createQueryBuilder()
          .search("publications")
          .for(args.query)
          .returnCitationsPerYear(args.startYear, args.endYear)
          .build();
        const response = await client.rawQuery(dsl);
        return formatToolResult({
          query: args.query,
          startYear: args.startYear,
          endYear: args.endYear,
          citationsPerYear: normalizeYearSeries(response.citations_per_year, "count"),
        });
      } catch (error) {
        return formatErrorResult(error);
      }
    },
  );

  // Funding Trend
  server.registerTool(
    "funding_trend",
    {
      description:
        "Year-by-year funding totals for a topic. Returns annual grant funding amounts for grants " +
        "matching the query over the specified year range.",
      inputSchema: {
        query: z
          .string()
          .min(1)
          .describe("Search query to identify grants (e.g., 'cancer immunotherapy')"),
        startYear: z
          .number()
          .int()
          .min(1900)
          .max(2100)
          .describe("First year of the time range (inclusive)"),
        endYear: z
          .number()
          .int()
          .min(1900)
          .max(2100)
          .describe("Last year of the time range (inclusive)"),
        currency: z
          .enum(SUPPORTED_CURRENCIES)
          .default("USD")
          .describe(
            `Currency for funding amounts (default USD). Supported: ${SUPPORTED_CURRENCIES.join(", ")}.`,
          ),
      },
      outputSchema: {
        query: z.string().describe("Search query used"),
        startYear: z.number().describe("First year of range"),
        endYear: z.number().describe("Last year of range"),
        currency: z.string().describe("Currency of funding amounts"),
        fundingPerYear: z
          .array(z.record(z.string(), z.unknown()))
          .describe("Annual funding totals"),
      },
      annotations: READ_ONLY_API_ANNOTATIONS,
    },
    async (args) => {
      try {
        if (args.startYear > args.endYear) {
          throw new McpError(
            ErrorCode.InvalidParams,
            `startYear (${args.startYear}) must be ≤ endYear (${args.endYear})`,
          );
        }
        const dsl = client
          .createQueryBuilder()
          .search("grants")
          .for(args.query)
          .returnFundingPerYear(args.startYear, args.endYear, args.currency as Currency)
          .build();
        const response = await client.rawQuery(dsl);
        return formatToolResult({
          query: args.query,
          startYear: args.startYear,
          endYear: args.endYear,
          currency: args.currency,
          fundingPerYear: normalizeYearSeries(response.funding_per_year, "funding"),
        });
      } catch (error) {
        return formatErrorResult(error);
      }
    },
  );
}
