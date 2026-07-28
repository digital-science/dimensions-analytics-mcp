/**
 * Guards curated DSL examples shown via dimensions://examples.
 * @module test/examples/dsl-examples
 */

import { describe, expect, it } from "vitest";
import {
  DSL_EXAMPLE_SOURCE_NAMES,
  DSL_EXAMPLES_BY_ENTITY,
  DSL_GENERAL_EXAMPLES,
  getDslExamplesForSource,
} from "../../src/mcp/examples/dsl-examples.js";

const ALL_EXAMPLES = [...Object.values(DSL_EXAMPLES_BY_ENTITY).flat(), ...DSL_GENERAL_EXAMPLES];

describe("dsl-examples", () => {
  it("lists all structured example sources", () => {
    expect(DSL_EXAMPLE_SOURCE_NAMES).toEqual(Object.keys(DSL_EXAMPLES_BY_ENTITY).sort());
    expect(getDslExamplesForSource("publications")?.length).toBeGreaterThan(0);
    expect(getDslExamplesForSource("unknown")).toBeUndefined();
  });

  it("includes similar_documents examples for publications and grants", () => {
    const pubs = getDslExamplesForSource("publications") ?? [];
    const grants = getDslExamplesForSource("grants") ?? [];
    expect(pubs.some((q) => q.includes("similar_documents("))).toBe(true);
    expect(grants.some((q) => q.includes("similar_documents("))).toBe(true);
    expect(DSL_GENERAL_EXAMPLES.some((q) => q.includes("similar_documents("))).toBe(true);
  });

  it("uses sort by (not bare sort) and places sort before limit", () => {
    for (const dsl of ALL_EXAMPLES) {
      expect(dsl).not.toMatch(/\blimit \d+ sort\b/);
      expect(dsl).not.toMatch(/\bsort [a-z_0-9]+ (?:asc|desc)\b/);
    }
  });
});
