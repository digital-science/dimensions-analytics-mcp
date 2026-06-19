/**
 * Eval suite for MCP resources (fields metadata).
 * Tests the describe_fields resource template against the live server.
 * @module test/integration/suites/resources
 */

import { custom } from "../assertions.js";
import type { EvalSuite } from "../types.js";

/**
 * Resources eval suite.
 *
 * Note: Resources are accessed via the MCP client's readResource method,
 * not callTool. The harness runner handles this differently — resource
 * cases use tool="__resource__" as a sentinel and the URI is in args.uri.
 */
export const resourcesSuite: EvalSuite = {
  name: "resources",
  description: "Field metadata resources",
  cases: [
    {
      name: "list publications fields",
      tool: "__resource__",
      args: { uri: "dimensions://fields/publications" },
      assertions: [
        custom("returns field metadata object", (data) => {
          if (typeof data !== "object" || data === null) {
            return "Expected object response";
          }
          const d = data as Record<string, unknown>;
          // Should have field descriptions
          if (d.fields && typeof d.fields === "object") return true;
          // Or be the field map itself
          if (Object.keys(d).length > 0) return true;
          return "Expected non-empty field metadata";
        }),
      ],
    },
    {
      name: "list grants fields",
      tool: "__resource__",
      args: { uri: "dimensions://fields/grants" },
      assertions: [
        custom("returns field metadata", (data) => {
          return typeof data === "object" && data !== null && Object.keys(data as object).length > 0
            ? true
            : "Expected non-empty field metadata";
        }),
      ],
    },
    {
      name: "read publications DSL examples",
      tool: "__resource__",
      args: { uri: "dimensions://examples/publications" },
      assertions: [
        custom("returns per-source examples", (data) => {
          if (typeof data !== "object" || data === null) return "Expected object response";
          const d = data as Record<string, unknown>;
          if (d.source !== "publications") return "Expected source publications";
          if (!Array.isArray(d.examples) || d.examples.length === 0) {
            return "Expected non-empty examples array";
          }
          return true;
        }),
      ],
    },
  ],
};
