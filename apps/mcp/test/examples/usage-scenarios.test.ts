/**
 * @module test/examples/usage-scenarios
 */

import { beforeEach, describe, expect, it } from "vitest";
import { USAGE_SCENARIOS } from "../../src/mcp/examples/usage-scenarios.js";
import { registerAnalyticsTools } from "../../src/mcp/tools/analytics.js";
import { registerLookupTools } from "../../src/mcp/tools/lookup.js";
import { registerQueryTools } from "../../src/mcp/tools/query.js";
import { registerSearchTools } from "../../src/mcp/tools/search.js";
import { testSchemaStore } from "../helpers/schema-fixture.js";
import {
  callTool,
  createMockClient,
  createMockServer,
  parseToolResult,
} from "../helpers/tool-test-harness.js";

const schemaStore = testSchemaStore();

function apiRows(entity: string, data: unknown[], total = data.length) {
  return { [entity]: data, _stats: { total_count: total } };
}

describe("usage-scenarios", () => {
  let handlers: ReturnType<typeof createMockServer>["handlers"];
  let server: ReturnType<typeof createMockServer>["server"];
  let client: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    ({ server, handlers } = createMockServer());
    client = createMockClient();
    registerSearchTools(server as never, client as never, schemaStore);
    registerLookupTools(server as never, client as never);
    registerAnalyticsTools(server as never, client as never, schemaStore);
    registerQueryTools(server as never, client as never, schemaStore);
  });

  it("documents eleven natural-language workflows", () => {
    expect(USAGE_SCENARIOS).toHaveLength(11);
    expect(new Set(USAGE_SCENARIOS.map((s) => s.id)).size).toBe(11);
  });

  for (const scenario of USAGE_SCENARIOS) {
    it(`${scenario.id} → ${scenario.tool}`, async () => {
      expect(handlers.has(scenario.tool)).toBe(true);

      if (scenario.tool === "get_by_doi") {
        client.rawQuery.mockResolvedValue(
          apiRows("publications", [{ id: "pub.1", title: "Test", times_cited: 1 }]),
        );
      } else if (scenario.tool === "citation_trend") {
        client.rawQuery.mockResolvedValue({
          citations_per_year: { 2018: 100, 2019: 200, 2020: 300 },
        });
      } else if (scenario.tool === "facet_query") {
        const facetField = String(scenario.args.facetField ?? "researchers");
        client.rawQuery.mockResolvedValue({ [facetField]: [{ id: "1", count: 5 }] });
      } else if (scenario.tool === "aggregate_query") {
        client.rawQuery.mockResolvedValue({
          funder_orgs: [{ id: "grid.123", name: "European Commission", count: 1, funding: 1000 }],
        });
      } else if (scenario.tool === "execute_dsl") {
        client.rawQuery.mockResolvedValue({
          publications: [{ id: "pub.1" }],
          _stats: { total_count: 1 },
        });
      } else {
        client.rawQuery.mockResolvedValue(apiRows("publications", [{ id: "pub.1" }], 1));
      }

      const result = await callTool(handlers, scenario.tool, scenario.args);
      expect(result.isError).toBeUndefined();

      if (scenario.tool === "citation_trend") {
        const data = parseToolResult(result);
        expect(Array.isArray(data.citationsPerYear)).toBe(true);
        expect(data.citationsPerYear.length).toBeGreaterThan(0);
      }

      if (scenario.dslContains?.length) {
        expect(client.rawQuery).toHaveBeenCalled();
        const allDsl = client.rawQuery.mock.calls.map((c) => String(c[0])).join("\n");
        for (const fragment of scenario.dslContains) {
          expect(allDsl).toContain(fragment);
        }
      }
    });
  }
});
