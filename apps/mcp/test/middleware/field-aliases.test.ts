import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { describe, expect, it } from "vitest";
import {
  buildReverseAliasMap,
  ENTITY_ALIASES,
  resolveFacetFieldName,
  resolveFieldName,
  resolveFieldNames,
  withFieldAliases,
} from "../../src/mcp/middleware/field-aliases.js";

// ---------------------------------------------------------------------------
// resolveFieldName
// ---------------------------------------------------------------------------

describe("resolveFieldName", () => {
  it("resolves a known alias to its DSL name", () => {
    expect(resolveFieldName("publications", "total_citations")).toBe("times_cited");
  });

  it("passes through raw DSL field names unchanged", () => {
    expect(resolveFieldName("publications", "times_cited")).toBe("times_cited");
  });

  it("passes through unknown names unchanged", () => {
    expect(resolveFieldName("publications", "some_unknown_field")).toBe("some_unknown_field");
  });

  it("resolves grant aliases", () => {
    expect(resolveFieldName("grants", "funding_amount_usd")).toBe("funding_usd");
    expect(resolveFieldName("grants", "funder_name")).toBe("funder_org_name");
  });

  it("resolves grant facet field aliases separately from filter fields", () => {
    expect(resolveFacetFieldName("grants", "funders")).toBe("funder_orgs");
    expect(resolveFacetFieldName("grants", "funder_org_name")).toBe("funder_org_name");
    expect(resolveFieldName("grants", "funder_name")).toBe("funder_org_name");
  });

  it("resolves researcher aliases", () => {
    expect(resolveFieldName("researchers", "orcid")).toBe("orcid_id");
  });

  it("resolves indicator aliases", () => {
    expect(resolveFieldName("publications", "field_citation_ratio_avg")).toBe("fcr_gavg");
    expect(resolveFieldName("publications", "relative_citation_ratio_avg")).toBe("rcr_avg");
    expect(resolveFieldName("publications", "average_citations")).toBe("citations_avg");
    expect(resolveFieldName("grants", "total_funding")).toBe("funding");
  });

  it("does not resolve an alias from a different entity", () => {
    // total_citations is a publications alias, not a grants alias
    expect(resolveFieldName("grants", "total_citations")).toBe("total_citations");
  });

  it("returns name unchanged for an unknown entity type", () => {
    // Simulates dynamic entity source receiving unvalidated user input
    expect(resolveFieldName("unknown_entity" as never, "some_field")).toBe("some_field");
  });
});

// ---------------------------------------------------------------------------
// resolveFieldNames
// ---------------------------------------------------------------------------

describe("resolveFieldNames", () => {
  it("resolves an array mixing aliases and DSL names", () => {
    const result = resolveFieldNames("publications", [
      "total_citations",
      "title",
      "citation_ratio",
    ]);
    expect(result).toEqual(["times_cited", "title", "field_citation_ratio"]);
  });

  it("returns empty array for empty input", () => {
    expect(resolveFieldNames("publications", [])).toEqual([]);
  });

  it("returns names unchanged for an unknown entity type", () => {
    expect(resolveFieldNames("unknown_entity" as never, ["a", "b"])).toEqual(["a", "b"]);
  });
});

// ---------------------------------------------------------------------------
// ENTITY_ALIASES registry
// ---------------------------------------------------------------------------

describe("ENTITY_ALIASES", () => {
  const ALL_ENTITIES = [
    "publications",
    "grants",
    "patents",
    "clinical_trials",
    "datasets",
    "policy_documents",
    "researchers",
    "organizations",
  ] as const;

  it("has an entry for every entity type", () => {
    for (const entity of ALL_ENTITIES) {
      expect(ENTITY_ALIASES[entity]).toBeDefined();
      expect(typeof ENTITY_ALIASES[entity]).toBe("object");
    }
  });

  it("has no alias that collides with a DSL name from another entity's aliases", () => {
    // Collect all alias keys across all entities
    const aliasToEntity = new Map<string, string[]>();
    for (const entity of ALL_ENTITIES) {
      for (const alias of Object.keys(ENTITY_ALIASES[entity])) {
        const entities = aliasToEntity.get(alias) ?? [];
        entities.push(entity);
        aliasToEntity.set(alias, entities);
      }
    }
    // Each alias should only appear on one entity (or on multiple where it maps to the same concept)
    for (const [alias, entities] of aliasToEntity) {
      if (entities.length > 1) {
        // Verify they all map to the same DSL name
        const targets = new Set(
          entities.map((e) => ENTITY_ALIASES[e as keyof typeof ENTITY_ALIASES][alias]),
        );
        expect(targets.size).toBe(1);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// buildReverseAliasMap
// ---------------------------------------------------------------------------

describe("buildReverseAliasMap", () => {
  it("maps DSL name to its aliases", () => {
    const reverse = buildReverseAliasMap("publications");
    expect(reverse.get("times_cited")).toEqual(["total_citations"]);
    expect(reverse.get("field_citation_ratio")).toEqual(["citation_ratio"]);
  });

  it("returns empty map for entities with no aliases", () => {
    const reverse = buildReverseAliasMap("patents");
    expect(reverse.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// withFieldAliases HOF
// ---------------------------------------------------------------------------

describe("withFieldAliases", () => {
  /** Helper to create a handler that captures its received args. */
  function createCapturingHandler() {
    let capturedArgs: Record<string, unknown> = {};
    const handler = (args: Record<string, unknown>) => {
      capturedArgs = args;
      return { content: [{ type: "text" as const, text: "{}" }] } satisfies CallToolResult;
    };
    return { handler, getCapturedArgs: () => capturedArgs };
  }

  it("resolves fieldArrayArgs (e.g., fields)", () => {
    const { handler, getCapturedArgs } = createCapturingHandler();
    const wrapped = withFieldAliases(
      {
        entitySource: { kind: "static", entity: "publications" },
        fieldArrayArgs: ["fields"],
      },
      handler,
    );

    wrapped({ fields: ["total_citations", "title", "doi"] }, {});
    expect(getCapturedArgs().fields).toEqual(["times_cited", "title", "doi"]);
  });

  it("resolves fieldStringArgs (e.g., sortBy)", () => {
    const { handler, getCapturedArgs } = createCapturingHandler();
    const wrapped = withFieldAliases(
      {
        entitySource: { kind: "static", entity: "publications" },
        fieldStringArgs: ["sortBy"],
      },
      handler,
    );

    wrapped({ sortBy: "total_citations" }, {});
    expect(getCapturedArgs().sortBy).toBe("times_cited");
  });

  it("resolves filterArrayArgs (e.g., filters[].field)", () => {
    const { handler, getCapturedArgs } = createCapturingHandler();
    const wrapped = withFieldAliases(
      {
        entitySource: { kind: "static", entity: "publications" },
        filterArrayArgs: ["filters"],
      },
      handler,
    );

    wrapped(
      {
        filters: [
          { field: "total_citations", operator: ">=", value: 10 },
          { field: "year", operator: ">=", value: 2020 },
        ],
      },
      {},
    );
    const filters = getCapturedArgs().filters as Array<Record<string, unknown>>;
    expect(filters[0].field).toBe("times_cited");
    expect(filters[1].field).toBe("year"); // pass-through
  });

  it("handles dynamic entitySource from args", () => {
    const { handler, getCapturedArgs } = createCapturingHandler();
    const wrapped = withFieldAliases(
      {
        entitySource: { kind: "dynamic", argName: "entityType" },
        fieldArrayArgs: ["fields"],
      },
      handler,
    );

    wrapped({ entityType: "grants", fields: ["funding_amount_usd"] }, {});
    expect(getCapturedArgs().fields).toEqual(["funding_usd"]);
  });

  it("leaves non-field args untouched", () => {
    const { handler, getCapturedArgs } = createCapturingHandler();
    const wrapped = withFieldAliases(
      {
        entitySource: { kind: "static", entity: "publications" },
        fieldArrayArgs: ["fields"],
      },
      handler,
    );

    wrapped({ query: "CRISPR", limit: 50, fields: ["title"] }, {});
    expect(getCapturedArgs().query).toBe("CRISPR");
    expect(getCapturedArgs().limit).toBe(50);
  });

  it("handles undefined/missing optional args gracefully", () => {
    const { handler, getCapturedArgs } = createCapturingHandler();
    const wrapped = withFieldAliases(
      {
        entitySource: { kind: "static", entity: "publications" },
        fieldArrayArgs: ["fields"],
        fieldStringArgs: ["sortBy"],
        filterArrayArgs: ["filters"],
      },
      handler,
    );

    wrapped({ query: "test" }, {});
    expect(getCapturedArgs().fields).toBeUndefined();
    expect(getCapturedArgs().sortBy).toBeUndefined();
    expect(getCapturedArgs().filters).toBeUndefined();
  });

  it("preserves the return value from the inner handler", () => {
    const result: CallToolResult = {
      content: [{ type: "text", text: '{"count":42}' }],
    };
    const handler = () => result;
    const wrapped = withFieldAliases(
      { entitySource: { kind: "static", entity: "publications" } },
      handler,
    );

    expect(wrapped({}, {})).toBe(result);
  });

  it("preserves async handler behavior", async () => {
    const result: CallToolResult = {
      content: [{ type: "text", text: '{"count":42}' }],
    };
    const handler = async () => result;
    const wrapped = withFieldAliases(
      { entitySource: { kind: "static", entity: "publications" } },
      handler,
    );

    expect(await wrapped({}, {})).toBe(result);
  });
});
