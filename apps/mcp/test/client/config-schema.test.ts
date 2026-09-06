/**
 * Tests for DimensionsClientConfigSchema backend variants.
 * @module test/client/config-schema
 */

import { describe, expect, it } from "vitest";
import { DimensionsClientConfigSchema } from "../../src/client/config.js";

const INTERNAL_SERVICE = {
  serviceUrl: "https://dsl.example.com",
  username: "svc",
  password: "secret",
  dslSchema: "external",
  host: "app.example.com",
  variant: "standard",
};

describe("DimensionsClientConfigSchema", () => {
  it("defaults to the public backend when backend is omitted", () => {
    const parsed = DimensionsClientConfigSchema.parse({ apiKey: "test-key" });
    expect(parsed.backend).toBe("public");
    expect(parsed.apiKey).toBe("test-key");
  });

  it("rejects a public backend without an apiKey", () => {
    expect(DimensionsClientConfigSchema.safeParse({}).success).toBe(false);
    expect(DimensionsClientConfigSchema.safeParse({ backend: "public" }).success).toBe(false);
  });

  it("rejects an internal backend without internal config", () => {
    expect(DimensionsClientConfigSchema.safeParse({ backend: "internal" }).success).toBe(false);
  });

  it("parses a complete internal backend config", () => {
    const parsed = DimensionsClientConfigSchema.parse({
      backend: "internal",
      internal: {
        service: INTERNAL_SERVICE,
        userEmail: "user@example.com",
      },
    });
    expect(parsed.backend).toBe("internal");
    expect(parsed.internal.userEmail).toBe("user@example.com");
    expect(parsed.internal.service.host).toBe("app.example.com");
  });
});
