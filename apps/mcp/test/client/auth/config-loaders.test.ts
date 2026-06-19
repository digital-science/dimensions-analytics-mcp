import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fromEnv, fromObject, fromPath } from "../../../src/client/auth/config-loaders.js";
import { ValidationError } from "../../../src/client/errors.js";

describe("config-loaders", () => {
  describe("fromEnv", () => {
    const originalEnv = { ...process.env };
    let savedApiKey: string | undefined;

    beforeEach(() => {
      savedApiKey = process.env.DIMENSIONS_API_KEY;
      delete process.env.DIMENSIONS_API_KEY;
      delete process.env.DIMENSIONS_AUTH_URL;
      delete process.env.DIMENSIONS_TOKEN_CACHE_DURATION;
      delete process.env.DIMENSIONS_TIMEOUT;
      delete process.env.CUSTOM_API_KEY;
    });

    afterEach(() => {
      if (savedApiKey !== undefined) {
        process.env.DIMENSIONS_API_KEY = savedApiKey;
      } else {
        delete process.env.DIMENSIONS_API_KEY;
      }
      Object.assign(process.env, originalEnv);
    });

    it("loads JWT config from environment", () => {
      process.env.DIMENSIONS_API_KEY = "test-api-key";
      expect(fromEnv("jwt")).toEqual({ type: "jwt", apiKey: "test-api-key" });
    });

    it("loads optional JWT config fields", () => {
      process.env.DIMENSIONS_API_KEY = "test-api-key";
      process.env.DIMENSIONS_AUTH_URL = "https://custom.auth.com/token";
      process.env.DIMENSIONS_TOKEN_CACHE_DURATION = "7200";
      process.env.DIMENSIONS_TIMEOUT = "60000";

      expect(fromEnv("jwt")).toEqual({
        type: "jwt",
        apiKey: "test-api-key",
        authUrl: "https://custom.auth.com/token",
        tokenCacheDuration: 7200,
        timeout: 60000,
      });
    });

    it("throws when API key is missing", () => {
      expect(() => fromEnv("jwt")).toThrow(ValidationError);
    });
  });

  describe("fromObject", () => {
    it("validates JWT config object", () => {
      expect(fromObject({ type: "jwt", apiKey: "key" })).toEqual({
        type: "jwt",
        apiKey: "key",
      });
    });

    it("rejects invalid config", () => {
      expect(() => fromObject({ type: "basic", username: "u", password: "p" })).toThrow(
        ValidationError,
      );
    });
  });

  describe("fromPath", () => {
    const tempDir = join(tmpdir(), `dsl-auth-config-${Date.now()}`);

    beforeEach(() => {
      mkdirSync(tempDir, { recursive: true });
    });

    afterEach(() => {
      rmSync(tempDir, { recursive: true, force: true });
    });

    it("loads JWT config from JSON file", () => {
      const filePath = join(tempDir, "auth.json");
      writeFileSync(filePath, JSON.stringify({ type: "jwt", apiKey: "file-key" }));
      expect(fromPath(filePath)).toEqual({ type: "jwt", apiKey: "file-key" });
    });

    it("throws for missing file", () => {
      expect(() => fromPath(join(tempDir, "missing.json"))).toThrow(ValidationError);
    });
  });
});
