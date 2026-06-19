#!/usr/bin/env node
/**
 * Live verification of docs/USAGE.md natural-language scenarios.
 * Run: node --import tsx apps/mcp/test/integration/verify-usage-scenarios.ts
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { USAGE_SCENARIOS } from "../../src/mcp/examples/usage-scenarios.js";
import { buildServerInstructions, createMcpServerAsync } from "../../src/mcp/server.js";

interface Row {
  id: string;
  tool: string;
  ok: boolean;
  summary: string;
  note?: string;
}

function summarize(tool: string, data: Record<string, unknown>): string {
  if (data.error) return `error: ${String(data.error)}`;
  switch (tool) {
    case "search_publications":
    case "search_grants":
    case "search_researchers":
      return `totalCount=${data.totalCount}, returned=${data.returnedCount}`;
    case "facet_query":
    case "aggregate_query":
      return `buckets=${data.totalBuckets}`;
    case "get_by_doi":
      return data.found
        ? `found: ${(data.publication as { title?: string })?.title ?? "ok"}`
        : `not found`;
    case "citation_trend": {
      const series = data.citationsPerYear as unknown[] | undefined;
      return `years=${series?.length ?? 0}`;
    }
    case "execute_dsl":
      return "ok";
    default:
      return "ok";
  }
}

async function callTool(client: Client, tool: string, args: Record<string, unknown>) {
  const result = await client.callTool({ name: tool, arguments: args });
  if ("isError" in result && result.isError) {
    const text = result.content.find((c) => c.type === "text" && "text" in c)?.text;
    const parsed = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    return { ok: false, data: parsed };
  }
  const text = result.content.find((c) => c.type === "text" && "text" in c)?.text;
  if (!text) return { ok: false, data: { error: "no text content" } };
  const data = JSON.parse(text) as Record<string, unknown>;
  return { ok: true, data };
}

async function main() {
  const apiKey = process.env.DIMENSIONS_API_KEY;
  if (!apiKey) {
    console.error("DIMENSIONS_API_KEY required");
    process.exit(1);
  }

  const { server, schemaStore } = await createMcpServerAsync({ apiKey });
  const instructions = buildServerInstructions(schemaStore);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "usage-verify", version: "1.0.0" });
  await server.connect(serverTransport);
  await client.connect(clientTransport);

  const rows: Row[] = [];

  for (const scenario of USAGE_SCENARIOS) {
    const { ok, data } = await callTool(client, scenario.tool, scenario.args);
    rows.push({
      id: scenario.id,
      tool: scenario.tool,
      ok,
      summary: summarize(scenario.tool, data),
    });
  }

  // Extra checks for documented edge cases
  const extras: Array<{ id: string; tool: string; args: Record<string, unknown> }> = [
    {
      id: "nih-acronym-grants",
      tool: "search_grants",
      args: {
        query: "cancer immunotherapy",
        startYearFrom: 2020,
        funderOrgName: "NIH",
        limit: 5,
      },
    },
    {
      id: "stanford-org-search",
      tool: "search_organizations",
      args: { query: "Stanford University", limit: 10 },
    },
    {
      id: "topic-on-search-researchers",
      tool: "search_researchers",
      args: { query: "quantum computing", limit: 5 },
    },
    {
      id: "funder-facet-funder_orgs",
      tool: "aggregate_query",
      args: {
        entityType: "grants",
        facetField: "funder_orgs",
        indicators: ["funding"],
        query: "climate adaptation",
        limit: 5,
      },
    },
    {
      id: "funder-facet-funder_org_name",
      tool: "aggregate_query",
      args: {
        entityType: "grants",
        facetField: "funder_org_name",
        indicators: ["funding"],
        query: "climate adaptation",
        limit: 5,
      },
    },
  ];

  for (const extra of extras) {
    const { ok, data } = await callTool(client, extra.tool, extra.args);
    rows.push({
      id: extra.id,
      tool: extra.tool,
      ok,
      summary: summarize(extra.tool, data),
      note: "edge-case",
    });
  }

  await client.close();
  await server.close();

  console.log("\n=== Server instructions (routing excerpt) ===");
  const routingLine = instructions.split("\n\n").find((p) => p.startsWith("Routing:"));
  console.log(routingLine ?? "(no routing section)");

  console.log("\n=== USAGE.md scenario verification ===");
  for (const row of rows) {
    const status = row.ok ? "PASS" : "FAIL";
    const tag = row.note ? ` [${row.note}]` : "";
    console.log(`${status}  ${row.id} → ${row.tool}: ${row.summary}${tag}`);
  }

  const failed = rows.filter((r) => !r.ok).length;
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
