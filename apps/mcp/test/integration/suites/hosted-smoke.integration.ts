/**
 * Minimal eval suite for hosted MCP smoke tests (local stdio harness uses full suites).
 * @module test/integration/suites/hosted-smoke
 */

import { arrayMinLength, fieldAtLeast, hasField, isSuccess } from "../assertions.js";
import type { EvalSuite } from "../types.js";

/** Smoke cases exercised over Streamable HTTP against hosted MCP. */
export const hostedSmokeSuite: EvalSuite = {
  name: "hosted-smoke",
  description: "Hosted MCP protocol smoke (describe + search)",
  cases: [
    {
      name: "describe_schema summary",
      tool: "describe_schema",
      args: {},
      assertions: [isSuccess(), hasField("summary"), hasField("stats")],
    },
    {
      name: "search publications for CRISPR",
      tool: "search_publications",
      args: { query: "CRISPR gene editing", limit: 5 },
      assertions: [
        isSuccess(),
        hasField("totalCount"),
        fieldAtLeast("totalCount", 1),
        arrayMinLength("publications", 1),
      ],
    },
    {
      name: "read schema summary resource",
      tool: "__resource__",
      args: { uri: "dimensions://schema/summary" },
      assertions: [isSuccess(), hasField("stats"), hasField("sources")],
    },
  ],
};
