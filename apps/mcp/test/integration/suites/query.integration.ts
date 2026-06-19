/**
 * Eval suite for the execute_dsl tool.
 * Tests raw DSL query execution against the live API.
 * @module test/integration/suites/query
 */

import { custom, hasField, isSuccess } from "../assertions.js";
import type { EvalSuite } from "../types.js";

export const querySuite: EvalSuite = {
  name: "query",
  description: "Raw DSL query execution",
  cases: [
    {
      name: "simple publication search DSL",
      tool: "execute_dsl",
      args: {
        dsl: 'search publications for "CRISPR" return publications[title+year+times_cited] limit 5',
      },
      assertions: [
        isSuccess(),
        hasField("publications"),
        custom("has publication results", (data) => {
          const d = data as Record<string, unknown>;
          const pubs = d.publications;
          return Array.isArray(pubs) && pubs.length > 0
            ? true
            : "Expected non-empty publications array";
        }),
      ],
    },
    {
      name: "aggregation DSL query",
      tool: "execute_dsl",
      args: {
        dsl: 'search publications for "deep learning" where year = 2023 return year aggregate citations_total limit 5',
      },
      assertions: [isSuccess()],
    },
    {
      name: "researcher search DSL",
      tool: "execute_dsl",
      args: {
        dsl: 'search researchers for "machine learning" return researchers[first_name+last_name] limit 5',
      },
      assertions: [isSuccess(), hasField("researchers")],
    },
  ],
};
