/**
 * Collects all integration test suites for the MCP smoke test harness.
 * @module test/integration/suites/index
 */

import type { EvalSuite } from "../types.js";
import { analyticsSuite } from "./analytics.integration.js";
import { functionsSuite } from "./functions.integration.js";
import { lookupSuite } from "./lookup.integration.js";
import { querySuite } from "./query.integration.js";
import { resourcesSuite } from "./resources.integration.js";
import { searchSuite } from "./search.integration.js";

/** All integration test suites, in execution order. */
export const allSuites: readonly EvalSuite[] = [
  searchSuite,
  lookupSuite,
  querySuite,
  functionsSuite,
  analyticsSuite,
  resourcesSuite,
];
