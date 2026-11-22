/**
 * Pins which tools declare their result text as untrusted data (WEBAPPDEV-14248, AC1).
 * Goes through the real stdio registration path so the schema-driven search_* loop is covered.
 * @module test/mcp/untrusted-result-note
 */
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { describe, expect, it } from "vitest";
import { startMcpServer } from "../../src/mcp/server.js";
import { UNTRUSTED_RESULT_NOTE } from "../../src/mcp/untrusted-output.js";
import { testSchemaStore } from "../helpers/schema-fixture.js";

/**
 * Every tool that returns third-party record text and therefore carries the note.
 * Tools absent from this list return no free text written by third parties:
 * construct_profile_url, describe_schema, refresh_schema, citation_trend, funding_trend.
 */
const EXPECTED_NOTED_TOOLS = [
  "aggregate_query",
  "execute_dsl",
  "extract_affiliations",
  "extract_grants",
  "facet_query",
  "fetch_search_pages",
  "get_by_doi",
  "get_by_id",
  "get_by_pmid",
  "researcher_profile",
  "search_clinical_trials",
  "search_datasets",
  "search_funder_groups",
  "search_grants",
  "search_organizations",
  "search_patents",
  "search_policy_documents",
  "search_publications",
  "search_reports",
  "search_research_org_groups",
  "search_researchers",
  "search_source_titles",
  "similar_documents",
];

describe("untrusted result note", () => {
  it("appears on exactly the tools that return third-party record text", async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const handle = await startMcpServer(serverTransport, {
      apiKey: "test-key",
      schemaStore: testSchemaStore(),
    });
    const client = new Client({ name: "untrusted-note-test", version: "1.0.0" });
    await client.connect(clientTransport);
    try {
      const { tools } = await client.listTools();
      const withNote = tools
        .filter((tool) => (tool.description ?? "").includes(UNTRUSTED_RESULT_NOTE))
        .map((tool) => tool.name)
        .sort();
      expect(withNote).toEqual([...EXPECTED_NOTED_TOOLS].sort());
    } finally {
      await client.close();
      await handle.close();
    }
  });
});
