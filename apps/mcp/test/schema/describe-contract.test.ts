/**
 * Contract tests ensuring describe fixture matches expected shape.
 * @module test/schema/describe-contract
 */

import { describe, expect, it } from "vitest";
import { extractDescribeSchema } from "../../src/dsl/index.js";
import fixture from "../fixtures/describe-schema.json";

describe("describe schema contract", () => {
  it("fixture has sources and entities", () => {
    const schema = extractDescribeSchema(fixture);
    expect(Object.keys(schema.sources).length).toBeGreaterThan(0);
    expect(Object.keys(schema.entities).length).toBeGreaterThan(0);
  });

  it("publications source has fields with types", () => {
    const schema = extractDescribeSchema(fixture);
    const pub = schema.sources.publications;
    expect(pub).toBeDefined();
    expect(pub?.fields.title).toBeDefined();
    expect(typeof pub?.fields.title?.type).toBe("string");
  });
});
