/**
 * Eval suite for entity resolution function tools.
 * @module test/integration/suites/functions
 */

import { hasField, isSuccess } from "../assertions.js";
import type { EvalSuite } from "../types.js";

export const functionsSuite: EvalSuite = {
  name: "functions",
  description: "Entity resolution tools (affiliations, grants)",
  cases: [
    {
      name: "extract affiliations from freetext",
      tool: "extract_affiliations",
      args: {
        affiliations: [
          { affiliation: "Department of Computer Science, Stanford University, CA, USA" },
          { affiliation: "Max Planck Institute for Molecular Cell Biology, Dresden, Germany" },
        ],
      },
      assertions: [isSuccess(), hasField("affiliations")],
      tags: ["flaky"],
    },
    {
      name: "extract grant from grant number",
      tool: "extract_grants",
      args: {
        grant_number: "R01GM123456",
        funder_name: "National Institutes of Health",
      },
      assertions: [isSuccess(), hasField("grants")],
      tags: ["flaky"],
      timeout: 60_000,
    },
  ],
};
