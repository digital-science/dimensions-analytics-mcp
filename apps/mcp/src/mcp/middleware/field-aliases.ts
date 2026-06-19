/**
 * Field name alias middleware for MCP tools.
 * Translates LLM-friendly field aliases to raw Dimensions DSL field names
 * via a higher-order function (decorator) pattern.
 * @module mcp/middleware/field-aliases
 */

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { EntityType } from "../../dsl/index.js";

// ---------------------------------------------------------------------------
// Per-entity alias maps (targets are raw DSL field / metric names)
// ---------------------------------------------------------------------------

/**
 * Publication field aliases.
 * Keys: LLM-friendly names. Values: raw DSL field names.
 */
const PUBLICATION_ALIASES = {
  total_citations: "times_cited",
  citation_ratio: "field_citation_ratio",
  altmetric_score: "altmetric",
  fields_of_research: "category_for",
  sdg_categories: "category_sdg",
} as const satisfies Record<string, string>;

/**
 * Publication indicator aliases for aggregation queries.
 */
const PUBLICATION_INDICATOR_ALIASES = {
  field_citation_ratio_avg: "fcr_gavg",
  relative_citation_ratio_avg: "rcr_avg",
  total_citations_sum: "citations_total",
  average_citations: "citations_avg",
  median_citations: "citations_median",
} as const satisfies Record<string, string>;

/**
 * Grant field aliases.
 */
const GRANT_ALIASES = {
  funding_amount_usd: "funding_usd",
  funding_amount_eur: "funding_eur",
  funder_name: "funder_org_name",
} as const satisfies Record<string, string>;

/**
 * Grant facet-field aliases (entity facets, not filter fields).
 * Live describe uses `funder_orgs`; older examples used `funders`.
 */
const GRANT_FACET_FIELD_ALIASES = {
  funders: "funder_orgs",
} as const satisfies Record<string, string>;

/** Per-entity facet field alias maps. */
const FACET_FIELD_ALIASES: Partial<Readonly<Record<EntityType, Readonly<Record<string, string>>>>> =
  {
    grants: GRANT_FACET_FIELD_ALIASES,
  };

/**
 * Grant indicator aliases for aggregation queries.
 */
const GRANT_INDICATOR_ALIASES = {
  total_funding: "funding",
} as const satisfies Record<string, string>;

/** Patent field aliases. */
const PATENT_ALIASES = {} as const satisfies Record<string, string>;

/** Clinical trial field aliases. */
const CLINICAL_TRIAL_ALIASES = {} as const satisfies Record<string, string>;

/** Dataset field aliases. */
const DATASET_ALIASES = {} as const satisfies Record<string, string>;

/** Policy document field aliases. */
const POLICY_DOCUMENT_ALIASES = {} as const satisfies Record<string, string>;

/** Researcher field aliases. */
const RESEARCHER_ALIASES = {
  orcid: "orcid_id",
} as const satisfies Record<string, string>;

/** Organization field aliases. */
const ORGANIZATION_ALIASES = {} as const satisfies Record<string, string>;

// ---------------------------------------------------------------------------
// Merged per-entity runtime maps
// ---------------------------------------------------------------------------

/**
 * Runtime alias registry. One flat map per entity type.
 * Keys: LLM-friendly alias names. Values: raw DSL field names.
 * Unknown names pass through unchanged at resolution time.
 */
export const ENTITY_ALIASES: Readonly<Record<EntityType, Readonly<Record<string, string>>>> = {
  publications: { ...PUBLICATION_ALIASES, ...PUBLICATION_INDICATOR_ALIASES },
  grants: { ...GRANT_ALIASES, ...GRANT_INDICATOR_ALIASES },
  patents: { ...PATENT_ALIASES },
  clinical_trials: { ...CLINICAL_TRIAL_ALIASES },
  datasets: { ...DATASET_ALIASES },
  policy_documents: { ...POLICY_DOCUMENT_ALIASES },
  researchers: { ...RESEARCHER_ALIASES },
  organizations: { ...ORGANIZATION_ALIASES },
};

// ---------------------------------------------------------------------------
// Resolution functions
// ---------------------------------------------------------------------------

/**
 * Resolves a single field alias to its raw DSL name.
 * Returns the input unchanged if it is not a known alias (pass-through).
 * @param entity - The entity type
 * @param name - Alias name or raw DSL field name
 * @returns The raw DSL field name
 */
export function resolveFieldName(entity: EntityType, name: string): string {
  const map = ENTITY_ALIASES[entity];
  if (!map) return name;
  return map[name] ?? name;
}

/**
 * Resolves facet-field aliases (e.g. grants `funders` → `funder_orgs` on live describe).
 * Falls back to {@link resolveFieldName} when no facet-specific alias exists.
 * @param entity - The entity type
 * @param name - Facet field name or alias
 * @returns Raw DSL facet field name
 */
export function resolveFacetFieldName(entity: EntityType, name: string): string {
  const facetMap = FACET_FIELD_ALIASES[entity];
  if (facetMap?.[name]) return facetMap[name];
  return resolveFieldName(entity, name);
}

/**
 * Resolves an array of field names, applying alias resolution to each.
 * @param entity - The entity type
 * @param names - Array of alias or DSL field names
 * @returns Array of raw DSL field names
 */
export function resolveFieldNames(entity: EntityType, names: readonly string[]): string[] {
  const map = ENTITY_ALIASES[entity];
  if (!map) return [...names];
  return names.map((n) => map[n] ?? n);
}

/**
 * Builds a reverse lookup map: DSL field name → alias names.
 * Useful for documentation and resource generation.
 * @param entity - The entity type
 * @returns Map of DSL field name → array of alias names
 */
export function buildReverseAliasMap(entity: EntityType): Map<string, string[]> {
  const map = ENTITY_ALIASES[entity];
  const reverse = new Map<string, string[]>();
  for (const [alias, dslName] of Object.entries(map)) {
    const existing = reverse.get(dslName);
    if (existing) {
      existing.push(alias);
    } else {
      reverse.set(dslName, [alias]);
    }
  }
  return reverse;
}

// ---------------------------------------------------------------------------
// Descriptor type — declares which args of a tool contain field names
// ---------------------------------------------------------------------------

/**
 * Where to find the entity type for alias resolution.
 * - `static`: hardcoded at registration time (e.g., search_publications → "publications")
 * - `dynamic`: read from an arg at call time (e.g., get_by_id → args.entityType)
 */
export type EntitySource =
  | { readonly kind: "static"; readonly entity: EntityType }
  | { readonly kind: "dynamic"; readonly argName: string };

/**
 * Describes which args of a tool contain field names that need alias resolution.
 */
export interface FieldAliasDescriptor {
  /** Where to get the entity type. */
  readonly entitySource: EntitySource;
  /** Args that are `string[]` of field names (e.g., `["fields"]`, `["indicators"]`). */
  readonly fieldArrayArgs?: readonly string[];
  /** Args that are a single field name string (e.g., `["sortBy"]`, `["facetField"]`). */
  readonly fieldStringArgs?: readonly string[];
  /** Args that are arrays of filter objects with a `.field` property (e.g., `["filters"]`). */
  readonly filterArrayArgs?: readonly string[];
}

// ---------------------------------------------------------------------------
// HOF middleware — wraps a tool handler with field alias resolution
// ---------------------------------------------------------------------------

/** Generic tool handler function type compatible with the MCP SDK. */
// biome-ignore lint/suspicious/noExplicitAny: Required to preserve MCP SDK's Zod-inferred arg types through the generic constraint
type ToolHandler = (args: any, extra: any) => CallToolResult | Promise<CallToolResult>;

/**
 * Wraps a tool handler with transparent field alias resolution.
 * Resolves LLM-friendly aliases to raw DSL field names before the inner handler runs.
 *
 * @param descriptor - Declares which args contain field names
 * @param handler - The inner tool handler
 * @returns A new handler with the same signature that pre-processes args
 *
 * @example
 * ```typescript
 * server.registerTool("search_publications", config,
 *   withFieldAliases(
 *     {
 *       entitySource: { kind: "static", entity: "publications" },
 *       fieldArrayArgs: ["fields"],
 *       fieldStringArgs: ["sortBy"],
 *       filterArrayArgs: ["filters"],
 *     },
 *     async (args) => { ... },
 *   ),
 * );
 * ```
 */
export function withFieldAliases<T extends ToolHandler>(
  descriptor: FieldAliasDescriptor,
  handler: T,
): T {
  const wrapper = (args: Record<string, unknown>, extra: Record<string, unknown>) => {
    const entity: EntityType =
      descriptor.entitySource.kind === "static"
        ? descriptor.entitySource.entity
        : (args[descriptor.entitySource.argName] as EntityType);

    const resolved = { ...args };

    // Resolve string[] field arrays (e.g., args.fields, args.indicators)
    for (const argName of descriptor.fieldArrayArgs ?? []) {
      const val = resolved[argName];
      if (Array.isArray(val)) {
        resolved[argName] = resolveFieldNames(entity, val as string[]);
      }
    }

    // Resolve single field name strings (e.g., args.sortBy, args.facetField)
    for (const argName of descriptor.fieldStringArgs ?? []) {
      const val = resolved[argName];
      if (typeof val === "string") {
        resolved[argName] = resolveFieldName(entity, val);
      }
    }

    // Resolve filter object arrays (e.g., args.filters[].field)
    for (const argName of descriptor.filterArrayArgs ?? []) {
      const val = resolved[argName];
      if (Array.isArray(val)) {
        resolved[argName] = (val as Array<Record<string, unknown>>).map((filter) => ({
          ...filter,
          field:
            typeof filter.field === "string"
              ? resolveFieldName(entity, filter.field)
              : filter.field,
        }));
      }
    }

    return handler(resolved, extra);
  };

  return wrapper as T;
}
