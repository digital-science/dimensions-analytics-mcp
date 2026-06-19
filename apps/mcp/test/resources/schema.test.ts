/**
 * Tests for dynamic schema MCP resources.
 * @module test/resources/schema
 */

import { describe, expect, it } from "vitest";
import { registerSchemaResources } from "../../src/mcp/resources/schema.js";
import { testSchemaStore } from "../helpers/schema-fixture.js";

describe("registerSchemaResources", () => {
  it("registers schema, limits, examples, and fields resources", () => {
    const context = { store: testSchemaStore() };
    const resources: Array<{ name: string; uri: string | { uriTemplate?: string } }> = [];
    const server = {
      resource: (name: string, uri: string | { uriTemplate?: string }, ..._rest: unknown[]) => {
        resources.push({ name, uri });
      },
    };
    registerSchemaResources(server as never, context);
    expect(resources.some((r) => r.name === "schema-summary")).toBe(true);
    expect(resources.some((r) => r.name === "schema-full")).toBe(true);
    expect(resources.some((r) => r.name === "schema-limits")).toBe(true);
    expect(resources.some((r) => r.name === "schema-policy")).toBe(true);
    expect(resources.some((r) => r.name === "dsl-examples")).toBe(true);
    expect(resources.some((r) => r.name === "dsl-examples-by-source")).toBe(true);
    expect(resources.some((r) => r.name === "fields")).toBe(true);
  });
});
