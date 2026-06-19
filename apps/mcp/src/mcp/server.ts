/**
 * Dimensions Analytics MCP server for the Dimensions Analytics API.
 * Provides tools for searching and querying the Dimensions database.
 * @module mcp/server
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import pkg from "../../package.json" with { type: "json" };
import { type HostedEnvConfig, loadDeploymentConfig } from "../client/index.js";
import { createBootstrapDimensionsClient, createDimensionsClient } from "../dsl/create-client.js";
import type { DimensionsClient } from "../dsl/index.js";
import {
  clearSchemaCache,
  getOrLoadSchema,
  loadSchema,
  type SchemaStore,
} from "../dsl/schema/index.js";
import { registerSchemaResources } from "./resources/schema.js";
import type { SchemaContext } from "./schema/context.js";
import { getSharedSchemaStore } from "./shared-schema.js";
import { registerAnalyticsTools } from "./tools/analytics.js";
import { registerFetchSearchPagesTools } from "./tools/fetch-search-pages.js";
import { registerFunctionTools } from "./tools/functions.js";
import { registerLookupTools } from "./tools/lookup.js";
import { registerQueryTools } from "./tools/query.js";
import { registerSchemaTools, validateFieldAliases } from "./tools/schema.js";
import { registerSearchTools } from "./tools/search.js";

/**
 * Configuration options for the MCP server.
 */
export interface McpServerConfig {
  /** Dimensions API key (required for local stdio) */
  apiKey?: string;
  /** Base URL for the Dimensions API (local public backend) */
  baseUrl?: string;
  /** Pre-loaded schema store (for tests; skips live describe fetch) */
  schemaStore?: SchemaStore;
  /** Deployment mode override */
  deploymentMode?: "local" | "hosted";
  /** Hosted deployment env (required when deploymentMode is hosted) */
  hosted?: HostedEnvConfig;
  /** Resolved user email for hosted dsl-service (per session) */
  userEmail?: string;
  /** Client IP to forward to dsl-service and auth.json */
  clientIp?: string;
}

/**
 * Reads a positive integer from an environment variable with a default fallback.
 */
function readIntEnv(raw: string | undefined, fallback: number, min: number): number {
  if (raw == null || raw.trim() === "") return fallback;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value >= min ? value : fallback;
}

function resolveDeployment(config: McpServerConfig): {
  mode: "local" | "hosted";
  hosted?: HostedEnvConfig;
} {
  if (config.deploymentMode) {
    return {
      mode: config.deploymentMode,
      hosted: config.hosted,
    };
  }
  const loaded = loadDeploymentConfig();
  if (loaded.deploymentMode === "hosted") {
    return { mode: "hosted", hosted: loaded };
  }
  return { mode: "local" };
}

/**
 * Builds server instructions from loaded schema.
 */
export function buildServerInstructions(schemaStore: SchemaStore): string {
  const version = schemaStore.version ? ` DSL ${schemaStore.version}.` : "";
  const paginationNote =
    process.env.DEPLOYMENT_MODE === "hosted"
      ? "search_* supports skip/page; fetch_search_pages is not available on hosted MCP;"
      : "search_* / fetch_search_pages: skip/page (max 1000/page, 50 pages, 50000 records);";

  return [
    `Dimensions Analytics API — scholarly research data.${version}`,
    [
      "Workflow:",
      "(1) Discover schema — read dimensions://schema/summary, dimensions://fields/{entity}, dimensions://examples/{source}, or describe_schema;",
      "(2) Search — search_* for keyword discovery with filters; get_by_doi, get_by_pmid, get_by_id for known identifiers;",
      "(3) Analyze — facet_query, aggregate_query, citation_trend, funding_trend;",
      "(4) Drill down — get_by_id, search_* with filters (e.g. researchers.id, research_orgs.id), facet_query for top researchers at an org.",
    ].join(" "),
    [
      "Routing:",
      "search_researchers matches names only — topic→researcher uses facet_query (entityType publications, facetField researchers);",
      "search_grants funderOrgName needs exact Dimensions names (NCI/NSF acronyms resolve; discover funders via facet_query/aggregate_query on facetField funder_orgs);",
      "search_organizations for institution lookup — prefer GRID id in filters when the name is ambiguous;",
      "facet_query supports yearFrom/yearTo for year-scoped facets.",
    ].join(" "),
    [
      "Query construction:",
      "for ranked publication search (e.g. most-cited since 2020), use search_publications with query, yearFrom, sortBy (times_cited or total_citations), limit — do not hand-write execute_dsl;",
      "use execute_dsl for boolean concept groups and DSL special functions;",
      "use execute_dsl only when structured tools are insufficient; DSL order is return ... sort by FIELD order limit N (never limit before sort).",
    ].join(" "),
    [
      "Pagination & policy:",
      "read dimensions://schema/policy before large pulls;",
      paginationNote,
      "confirmLargeFetch required for deep pagination (skip≥5000, page≥5) and batch pulls (>5 pages);",
      "facets max 1000 buckets, no skip; ~30 requests/min client rate limit.",
    ].join(" "),
  ].join("\n\n");
}

function registerAllTools(
  server: McpServer,
  client: DimensionsClient,
  schemaStore: SchemaStore,
  schemaContext: SchemaContext,
  deploymentMode: "local" | "hosted",
): void {
  registerSchemaResources(server, schemaContext);
  registerSearchTools(server, client, schemaStore);
  if (deploymentMode === "local") {
    registerFetchSearchPagesTools(server, client, schemaStore);
  }
  registerLookupTools(server, client);
  registerQueryTools(server, client, schemaStore);
  registerFunctionTools(server, client);
  registerAnalyticsTools(server, client, schemaStore);
  registerSchemaTools(server, client, schemaContext);
}

async function loadSchemaForServer(
  client: DimensionsClient,
  config: McpServerConfig,
  deploymentMode: "local" | "hosted",
): Promise<SchemaStore> {
  if (config.schemaStore) {
    return config.schemaStore;
  }
  if (deploymentMode === "hosted") {
    return getSharedSchemaStore(client);
  }
  return getOrLoadSchema(client, process.env.SCHEMA_CACHE_PATH);
}

/**
 * Warms the shared schema cache for hosted deployment (call once at process startup).
 */
export async function warmHostedSchemaCache(hosted: HostedEnvConfig): Promise<SchemaStore> {
  const client = createBootstrapDimensionsClient(hosted);
  return getSharedSchemaStore(client);
}

/**
 * Creates and configures the MCP server.
 */
export async function createMcpServerAsync(config: McpServerConfig = {}): Promise<{
  server: McpServer;
  client: DimensionsClient;
  schemaContext: SchemaContext;
  schemaStore: SchemaStore;
}> {
  const { mode, hosted } = resolveDeployment(config);

  const client = createDimensionsClient({
    mode,
    hosted: hosted ?? config.hosted,
    apiKey: config.apiKey ?? process.env.DIMENSIONS_API_KEY,
    userEmail: config.userEmail,
    clientIp: config.clientIp,
    baseUrl: config.baseUrl ?? process.env.DIMENSIONS_BASE_URL,
    maxRetries: readIntEnv(process.env.DIMENSIONS_MAX_RETRIES, 3, 0),
    retryDelay: readIntEnv(process.env.DIMENSIONS_RETRY_DELAY_MS, 1000, 1),
    rateLimitPerMinute: readIntEnv(process.env.DIMENSIONS_RATE_LIMIT_PER_MINUTE, 30, 1),
  });

  const schemaStore = await loadSchemaForServer(client, config, mode);
  client.attachSchemaStore(schemaStore);

  const schemaContext: SchemaContext = { store: schemaStore };
  validateFieldAliases(schemaStore);

  const startedAt = Date.now();
  console.error(
    `Schema loaded: ${schemaStore.stats().sourceCount} sources, ${schemaStore.stats().entityCount} entities` +
      (schemaStore.version ? `, DSL ${schemaStore.version}` : "") +
      (schemaStore.stale ? " (stale cache)" : "") +
      ` [${schemaStore.loadSource}]` +
      ` (${Date.now() - startedAt}ms)`,
  );

  const server = new McpServer(
    {
      name: "dimensions",
      version: pkg.version,
    },
    {
      capabilities: {
        logging: {},
      },
      instructions: buildServerInstructions(schemaStore),
    },
  );

  registerAllTools(server, client, schemaStore, schemaContext, mode);

  return { server, client, schemaContext, schemaStore };
}

export interface McpServerHandle {
  readonly close: () => Promise<void>;
}

/**
 * Starts the MCP server with the given transport (defaults to stdio).
 */
export async function startMcpServer(
  injectedTransport?: Transport,
  config: McpServerConfig = {},
): Promise<McpServerHandle> {
  const { server } = await createMcpServerAsync(config);
  const transport = injectedTransport ?? new StdioServerTransport();

  server.server.onerror = (error: Error) => console.error(`MCP server error: ${error.message}`);

  if (!injectedTransport) {
    server.server.onclose = () => {
      process.exit(0);
    };
  }

  await server.connect(transport);

  return {
    close: async () => {
      await server.close();
    },
  };
}

export { clearSchemaCache, loadSchema, McpServer };
