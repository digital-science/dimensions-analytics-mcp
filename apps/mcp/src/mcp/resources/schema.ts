/**
 * Dynamic MCP resources derived from runtime {@link SchemaStore}.
 * @module mcp/resources/schema
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  buildUsagePolicy,
  type DescribeField,
  type EntityType,
  SCHEMA_LIMITS,
  type SchemaStore,
  type StructuredEntityType,
  searchToolName,
} from "../../dsl/index.js";
import {
  DSL_DOCUMENTATION_URL,
  DSL_EXAMPLE_SOURCE_NAMES,
  DSL_EXAMPLES_BY_ENTITY,
  DSL_EXAMPLES_BY_SOURCE_URI,
  DSL_GENERAL_EXAMPLES,
  getDslExamplesForSource,
} from "../examples/dsl-examples.js";
import { buildReverseAliasMap } from "../middleware/field-aliases.js";
import type { SchemaContext } from "../schema/context.js";

/**
 * Registers schema MCP resources from a loaded {@link SchemaStore}.
 * @param server - MCP server instance
 * @param context - Mutable schema context (handlers read latest store)
 */
export function registerSchemaResources(server: McpServer, context: SchemaContext): void {
  const schemaStore = () => context.store;
  server.resource(
    "schema-summary",
    "dimensions://schema/summary",
    {
      description:
        "Compact Dimensions DSL schema overview (counts, resource URIs) — start here on cold-start",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(schemaStore().summary(), null, 2),
        },
      ],
    }),
  );

  // Full schema
  server.resource(
    "schema-full",
    "dimensions://schema",
    {
      description:
        "Full Dimensions DSL schema (all sources and auxiliary entities). Prefer dimensions://schema/summary for discovery.",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(schemaStore().raw, null, 2),
        },
      ],
    }),
  );

  // Version
  server.resource(
    "schema-version",
    "dimensions://schema/version",
    {
      description: "Dimensions DSL version",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(
            { version: schemaStore().version, loadedAt: schemaStore().loadedAt.toISOString() },
            null,
            2,
          ),
        },
      ],
    }),
  );

  // Limits (static until upstream `describe limits` exists)
  server.resource(
    "schema-limits",
    "dimensions://schema/limits",
    {
      description: "Operational limits for Dimensions DSL queries",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(SCHEMA_LIMITS, null, 2),
        },
      ],
    }),
  );

  server.resource(
    "schema-policy",
    "dimensions://schema/policy",
    {
      description:
        "Dimensions reasonable-use policy, MCP guardrails, and pagination recommendations",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(buildUsagePolicy(), null, 2),
        },
      ],
    }),
  );

  server.resource(
    "dsl-examples",
    "dimensions://examples",
    {
      description: `Curated Dimensions DSL example queries. See official docs: ${DSL_DOCUMENTATION_URL}`,
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(
            {
              documentation: DSL_DOCUMENTATION_URL,
              general: DSL_GENERAL_EXAMPLES,
              sources: DSL_EXAMPLE_SOURCE_NAMES,
              bySource: DSL_EXAMPLES_BY_SOURCE_URI,
              byEntity: DSL_EXAMPLES_BY_ENTITY,
            },
            null,
            2,
          ),
        },
      ],
    }),
  );

  server.resource(
    "dsl-examples-by-source",
    new ResourceTemplate("dimensions://examples/{source}", {
      list: async () => ({
        resources: DSL_EXAMPLE_SOURCE_NAMES.map((source) => ({
          uri: `dimensions://examples/${source}`,
          name: `${source} DSL examples`,
          description: `Curated DSL example queries for ${source}`,
          mimeType: "application/json",
        })),
      }),
      complete: {
        source: (value) => DSL_EXAMPLE_SOURCE_NAMES.filter((name) => name.startsWith(value)),
      },
    }),
    {
      description: "Per-source curated Dimensions DSL example queries",
      mimeType: "application/json",
    },
    async (uri, { source }) => {
      const sourceName = String(source);
      const examples = getDslExamplesForSource(sourceName);
      if (!examples) {
        throw new Error(
          `No examples for source: ${sourceName}. Available: ${DSL_EXAMPLE_SOURCE_NAMES.join(", ")}`,
        );
      }

      const structured = schemaStore().structuredEntityTypes();
      const relatedResources: Record<string, string> = {
        fields: `dimensions://fields/${sourceName}`,
        schemaSource: `dimensions://schema/sources/${sourceName}`,
      };
      if (structured.includes(sourceName as StructuredEntityType)) {
        relatedResources.searchTool = searchToolName(sourceName as StructuredEntityType);
      }

      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(
              {
                source: sourceName,
                documentation: DSL_DOCUMENTATION_URL,
                examples,
                relatedResources,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  const sourceNames = () => schemaStore().sourceNames();
  server.resource(
    "schema-sources",
    new ResourceTemplate("dimensions://schema/sources/{sourceName}", {
      list: async () => ({
        resources: sourceNames().map((name) => ({
          uri: `dimensions://schema/sources/${name}`,
          name: `${name} schema`,
          description: `Schema for source ${name}`,
          mimeType: "application/json",
        })),
      }),
      complete: {
        sourceName: (value) => sourceNames().filter((name) => name.startsWith(value)),
      },
    }),
    {
      description: "Per-source Dimensions DSL schema",
      mimeType: "application/json",
    },
    async (uri, { sourceName }) => {
      const source = schemaStore().getSource(String(sourceName));
      if (!source) {
        throw new Error(`Unknown source: ${sourceName}`);
      }
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(source, null, 2),
          },
        ],
      };
    },
  );

  const entityNames = () => schemaStore().entityNames();
  server.resource(
    "schema-entities",
    new ResourceTemplate("dimensions://schema/entities/{entityName}", {
      list: async () => ({
        resources: entityNames().map((name) => ({
          uri: `dimensions://schema/entities/${name}`,
          name: `${name} entity schema`,
          description: `Auxiliary entity schema for ${name}`,
          mimeType: "application/json",
        })),
      }),
      complete: {
        entityName: (value) => entityNames().filter((name) => name.startsWith(value)),
      },
    }),
    {
      description: "Auxiliary entity schema for dot-notation filters",
      mimeType: "application/json",
    },
    async (uri, { entityName }) => {
      const entity = schemaStore().getEntity(String(entityName));
      if (!entity) {
        throw new Error(`Unknown entity: ${entityName}`);
      }
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(entity, null, 2),
          },
        ],
      };
    },
  );

  // Compatibility view for structured search tools
  const entityTypes = () => schemaStore().structuredEntityTypes();
  server.resource(
    "fields",
    new ResourceTemplate("dimensions://fields/{entityType}", {
      list: async () => ({
        resources: entityTypes().map((et) => ({
          uri: `dimensions://fields/${et}`,
          name: `${et} fields`,
          description: `Filterable fields for ${et}`,
          mimeType: "application/json",
        })),
      }),
      complete: {
        entityType: (value) => entityTypes().filter((et) => et.startsWith(value)),
      },
    }),
    {
      description: "Filterable fields and aliases for a Dimensions entity type",
      mimeType: "application/json",
    },
    async (uri, { entityType }) => {
      const entity = String(entityType) as EntityType;
      if (!entityTypes().includes(entity)) {
        throw new Error(`Unknown entity type: ${entity}`);
      }
      const source = schemaStore().getSource(entity);
      if (!source) {
        throw new Error(`No schema loaded for entity type: ${entity}`);
      }

      const reverseAliases = buildReverseAliasMap(entity);
      const augmentedFields: Record<string, { description: string; aliases?: string[] }> = {};
      for (const [fieldName, field] of Object.entries(source.fields) as [string, DescribeField][]) {
        if (field.is_filter !== true) {
          continue;
        }
        const description = field.description ?? field.type;
        const aliases = reverseAliases.get(fieldName);
        augmentedFields[fieldName] = aliases ? { description, aliases } : { description };
      }

      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(
              {
                entityType: entity,
                fields: augmentedFields,
                facets: schemaStore().facetFields(entity),
                metrics: schemaStore().metrics(entity),
                searchIndexes: schemaStore().searchIndexes(entity),
                fieldsets: schemaStore().fieldsets(entity),
                dslExamples: {
                  basicSearch: `search ${entity} for "your query" return ${entity} limit 10`,
                  withFields: `search ${entity} for "your query" return ${entity}[id+title] limit 10`,
                  withFilter: `search ${entity} for "your query" where year >= 2020 return ${entity} limit 10`,
                },
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );
}
