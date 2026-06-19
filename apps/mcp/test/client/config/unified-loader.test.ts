import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DimensionsConfigFileSchema,
  loadDimensionsConfig,
  loadServiceConfig,
} from "../../../src/client/config/unified-loader.js";

describe("Unified Config Loader", () => {
  describe("DimensionsConfigFileSchema", () => {
    it("parses dsl section", () => {
      const result = DimensionsConfigFileSchema.parse({
        dsl: { apiKey: "dsl-key", baseUrl: "https://dsl.example.com" },
      });
      expect(result.dsl?.apiKey).toBe("dsl-key");
    });

    it("allows missing sections", () => {
      const result = DimensionsConfigFileSchema.parse({});
      expect(result.dsl).toBeUndefined();
    });
  });

  describe("loadDimensionsConfig", () => {
    let tmpDir: string;

    beforeEach(async () => {
      tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "unified-loader-"));
    });

    afterEach(async () => {
      await fs.rm(tmpDir, { recursive: true });
    });

    it("loads config from cwd", async () => {
      const configPath = path.join(tmpDir, ".dimensions.config.json");
      await fs.writeFile(
        configPath,
        JSON.stringify({
          dsl: { apiKey: "test-dsl-key" },
        }),
      );

      const config = await loadDimensionsConfig({ cwd: tmpDir, homedir: tmpDir });
      expect(config?.dsl?.apiKey).toBe("test-dsl-key");
    });

    it("returns undefined when no config file exists", async () => {
      const config = await loadDimensionsConfig({ cwd: tmpDir, homedir: tmpDir });
      expect(config).toBeUndefined();
    });
  });

  describe("loadServiceConfig", () => {
    let tmpDir: string;
    const originalEnv: Record<string, string | undefined> = {};

    beforeEach(async () => {
      tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "unified-loader-"));
      originalEnv.DIMENSIONS_DSL_API_KEY = process.env.DIMENSIONS_DSL_API_KEY;
    });

    afterEach(async () => {
      if (originalEnv.DIMENSIONS_DSL_API_KEY === undefined) {
        delete process.env.DIMENSIONS_DSL_API_KEY;
      } else {
        process.env.DIMENSIONS_DSL_API_KEY = originalEnv.DIMENSIONS_DSL_API_KEY;
      }
      await fs.rm(tmpDir, { recursive: true });
    });

    it("loads dsl section from config file", async () => {
      const configPath = path.join(tmpDir, ".dimensions.config.json");
      await fs.writeFile(
        configPath,
        JSON.stringify({
          dsl: { apiKey: "file-key", baseUrl: "https://custom.com" },
        }),
      );

      const config = await loadServiceConfig("dsl", undefined, {
        cwd: tmpDir,
        homedir: tmpDir,
      });
      expect(config).toEqual({
        apiKey: "file-key",
        baseUrl: "https://custom.com",
      });
    });

    it("merges env vars over file config", async () => {
      const configPath = path.join(tmpDir, ".dimensions.config.json");
      await fs.writeFile(
        configPath,
        JSON.stringify({
          dsl: { apiKey: "file-key", baseUrl: "https://custom.com" },
        }),
      );

      process.env.DIMENSIONS_DSL_API_KEY = "env-key";

      const config = await loadServiceConfig(
        "dsl",
        { apiKey: "DIMENSIONS_DSL_API_KEY" },
        { cwd: tmpDir, homedir: tmpDir },
      );
      expect(config).toEqual({
        apiKey: "env-key",
        baseUrl: "https://custom.com",
      });
    });

    it("returns env-only config when no file exists", async () => {
      process.env.DIMENSIONS_DSL_API_KEY = "env-only-key";

      const config = await loadServiceConfig(
        "dsl",
        { apiKey: "DIMENSIONS_DSL_API_KEY" },
        { cwd: tmpDir, homedir: tmpDir },
      );
      expect(config).toEqual({ apiKey: "env-only-key" });
    });

    it("returns undefined when no config found", async () => {
      delete process.env.DIMENSIONS_DSL_API_KEY;

      const config = await loadServiceConfig("dsl", undefined, {
        cwd: tmpDir,
        homedir: tmpDir,
      });
      expect(config).toBeUndefined();
    });
  });
});
