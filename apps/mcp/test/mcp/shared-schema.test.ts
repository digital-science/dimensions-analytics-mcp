/**
 * Tests for the process-wide hosted schema cache.
 * @module test/mcp/shared-schema
 */

import { afterEach, describe, expect, it, vi } from "vitest";

const getOrLoadSchema = vi.fn();

vi.mock("../../src/dsl/schema/index.js", () => ({ getOrLoadSchema }));

const { clearSharedSchemaStore, getSharedSchemaStore } = await import(
  "../../src/mcp/shared-schema.js"
);

describe("getSharedSchemaStore", () => {
  afterEach(() => {
    clearSharedSchemaStore();
    getOrLoadSchema.mockReset();
  });

  it("loads once and reuses the store", async () => {
    const store = { version: "2.12" };
    getOrLoadSchema.mockResolvedValue(store);

    await expect(getSharedSchemaStore({} as never)).resolves.toBe(store);
    await expect(getSharedSchemaStore({} as never)).resolves.toBe(store);
    expect(getOrLoadSchema).toHaveBeenCalledTimes(1);
  });

  it("retries after a failed load instead of replaying the failure", async () => {
    const store = { version: "2.12" };
    getOrLoadSchema.mockRejectedValueOnce(new Error("fetch failed")).mockResolvedValue(store);

    await expect(getSharedSchemaStore({} as never)).rejects.toThrow("fetch failed");
    await expect(getSharedSchemaStore({} as never)).resolves.toBe(store);
    expect(getOrLoadSchema).toHaveBeenCalledTimes(2);
  });
});
