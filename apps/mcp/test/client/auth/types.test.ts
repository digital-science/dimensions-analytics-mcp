import { describe, expect, it } from "vitest";
import type { AuthConfig } from "../../../src/client/auth/types.js";
import { isJwtAuthConfig } from "../../../src/client/auth/types.js";

describe("auth types", () => {
  const jwtConfig: AuthConfig = {
    type: "jwt",
    apiKey: "test-key",
  };

  it("isJwtAuthConfig returns true for JWT config", () => {
    expect(isJwtAuthConfig(jwtConfig)).toBe(true);
  });

  it("isJwtAuthConfig returns false for other shapes", () => {
    expect(isJwtAuthConfig({ type: "jwt", apiKey: "x" } as AuthConfig)).toBe(true);
  });
});
