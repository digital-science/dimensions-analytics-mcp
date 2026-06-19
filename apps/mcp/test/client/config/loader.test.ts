import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadConfig, loadConfigFile } from "../../../src/client/config/loader.js";
import { DslConfigSchema } from "../../../src/client/config/schemas.js";

const CWD_CONFIG_PATH = path.join(process.cwd(), ".dimensions.config.json");
const HOME_CONFIG_PATH = path.join(os.homedir(), ".dimensions.config.json");

/**
 * Reads the current content of a file, or returns undefined if it doesn't exist.
 * Used to save and restore config files that tests overwrite.
 */
async function readFileOrUndefined(filePath: string): Promise<string | undefined> {
  try {
    return await fs.readFile(filePath, "utf-8");
  } catch {
    return undefined;
  }
}

/**
 * Restores a file to its previous content, or removes it if it didn't exist before.
 */
async function restoreFile(filePath: string, previousContent: string | undefined): Promise<void> {
  if (previousContent !== undefined) {
    await fs.writeFile(filePath, previousContent);
  } else {
    await fs.rm(filePath, { force: true });
  }
}

describe("loadConfigFile", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "config-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("loads and parses JSON config file", async () => {
    const configPath = path.join(tempDir, "config.json");
    const configContent = JSON.stringify({
      dsl: { apiKey: "test-key", baseUrl: "https://test.com" },
    });
    await fs.writeFile(configPath, configContent);

    const result = await loadConfigFile(configPath);

    expect(result).toEqual({
      dsl: { apiKey: "test-key", baseUrl: "https://test.com" },
    });
  });

  it("returns undefined for non-existent file", async () => {
    const result = await loadConfigFile(path.join(tempDir, "nonexistent.json"));

    expect(result).toBeUndefined();
  });

  it("throws on invalid JSON", async () => {
    const configPath = path.join(tempDir, "invalid.json");
    await fs.writeFile(configPath, "not valid json");

    await expect(loadConfigFile(configPath)).rejects.toThrow();
  });
});

describe("loadConfig", () => {
  const originalEnv = process.env;
  let tempDir: string;

  beforeEach(async () => {
    process.env = { ...originalEnv };
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "config-test-"));
  });

  afterEach(async () => {
    process.env = originalEnv;
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("explicit config path", () => {
    it("loads config from explicit path", async () => {
      const configPath = path.join(tempDir, "config.json");
      const configContent = JSON.stringify({
        dsl: { apiKey: "explicit-key" },
      });
      await fs.writeFile(configPath, configContent);

      const result = await loadConfig({ configPath, service: "dsl" }, DslConfigSchema);

      expect(result).toEqual({
        config: { apiKey: "explicit-key", baseUrl: "https://app.dimensions.ai" },
        source: "explicit",
      });
    });

    it("returns undefined if explicit path not found", async () => {
      const result = await loadConfig(
        { configPath: path.join(tempDir, "nonexistent.json"), service: "dsl" },
        DslConfigSchema,
      );

      expect(result).toBeUndefined();
    });
  });

  describe("environment variables", () => {
    it("loads DSL config from environment variables", async () => {
      process.env.DIMENSIONS_DSL_API_KEY = "env-api-key";
      process.env.DIMENSIONS_DSL_BASE_URL = "https://env.dimensions.ai";

      const result = await loadConfig({ service: "dsl" }, DslConfigSchema);

      expect(result).toEqual({
        config: { apiKey: "env-api-key", baseUrl: "https://env.dimensions.ai" },
        source: "env",
      });
    });
  });

  describe("validation", () => {
    it("returns undefined if service config not found in file", async () => {
      const configPath = path.join(tempDir, "config.json");
      const configContent = JSON.stringify({
        solr: { baseUrl: "https://solr.example.com" },
      });
      await fs.writeFile(configPath, configContent);

      const result = await loadConfig({ configPath, service: "dsl" }, DslConfigSchema);

      expect(result).toBeUndefined();
    });

    it("throws ValidationError if config fails schema validation", async () => {
      const configPath = path.join(tempDir, "config.json");
      const configContent = JSON.stringify({
        dsl: { apiKey: "" }, // Empty string fails min(1)
      });
      await fs.writeFile(configPath, configContent);

      await expect(loadConfig({ configPath, service: "dsl" }, DslConfigSchema)).rejects.toThrow();
    });
  });

  describe("environment variables with unknown service", () => {
    it("returns undefined for unknown service in loadFromEnv", async () => {
      process.env.DIMENSIONS_UNKNOWN_API_KEY = "test-key";

      const result = await loadConfig({ service: "unknownService" }, DslConfigSchema);

      expect(result).toBeUndefined();
    });

    it("skips environment variables that fail schema validation", async () => {
      process.env.DIMENSIONS_DSL_API_KEY = "valid-key";
      // Missing baseUrl is ok because it has a default

      const result = await loadConfig({ service: "dsl" }, DslConfigSchema);

      expect(result).toEqual({
        config: { apiKey: "valid-key", baseUrl: "https://app.dimensions.ai" },
        source: "env",
      });
    });

    it("falls through to cwd config when env vars incomplete", async () => {
      const savedCwd = await readFileOrUndefined(CWD_CONFIG_PATH);
      try {
        process.env.DIMENSIONS_DSL_BASE_URL = "https://partial.example.com";

        const configContent = JSON.stringify({
          dsl: { apiKey: "cwd-key", baseUrl: "https://cwd.com" },
        });
        await fs.writeFile(CWD_CONFIG_PATH, configContent);

        const result = await loadConfig({ service: "dsl" }, DslConfigSchema);

        expect(result?.source).toBe("cwd");
        expect(result?.config.apiKey).toBe("cwd-key");
      } finally {
        await restoreFile(CWD_CONFIG_PATH, savedCwd);
      }
    });
  });

  describe("cwd and home directory config files", () => {
    it("loads config from cwd when no env vars set", async () => {
      const savedCwd = await readFileOrUndefined(CWD_CONFIG_PATH);
      try {
        const configContent = JSON.stringify({
          dsl: { apiKey: "cwd-api-key", baseUrl: "https://cwd.dimensions.ai" },
        });
        await fs.writeFile(CWD_CONFIG_PATH, configContent);

        const result = await loadConfig({ service: "dsl" }, DslConfigSchema);

        expect(result).toEqual({
          config: { apiKey: "cwd-api-key", baseUrl: "https://cwd.dimensions.ai" },
          source: "cwd",
        });
      } finally {
        await restoreFile(CWD_CONFIG_PATH, savedCwd);
      }
    });

    it("loads config from home directory when cwd has no config", async () => {
      const savedCwd = await readFileOrUndefined(CWD_CONFIG_PATH);
      const savedHome = await readFileOrUndefined(HOME_CONFIG_PATH);
      try {
        // Remove cwd config so it falls through to home
        await fs.rm(CWD_CONFIG_PATH, { force: true });

        const configContent = JSON.stringify({
          dsl: { apiKey: "home-api-key" },
        });
        await fs.writeFile(HOME_CONFIG_PATH, configContent);

        const result = await loadConfig({ service: "dsl" }, DslConfigSchema);

        expect(result).toEqual({
          config: { apiKey: "home-api-key", baseUrl: "https://app.dimensions.ai" },
          source: "home",
        });
      } finally {
        await restoreFile(HOME_CONFIG_PATH, savedHome);
        await restoreFile(CWD_CONFIG_PATH, savedCwd);
      }
    });

    it("returns undefined when service not in cwd config", async () => {
      // Use tmpDir for both cwd and homedir so neither leaks in a real config
      // from the developer machine (we only want the one file we write here).
      const isolatedDir = await fs.mkdtemp(path.join(os.tmpdir(), "loader-test-"));
      try {
        const configContent = JSON.stringify({
          solr: { baseUrl: "https://solr.example.com" },
        });
        await fs.writeFile(path.join(isolatedDir, ".dimensions.config.json"), configContent);

        const result = await loadConfig(
          { service: "dsl", cwd: isolatedDir, homedir: isolatedDir },
          DslConfigSchema,
        );

        expect(result).toBeUndefined();
      } finally {
        await fs.rm(isolatedDir, { recursive: true, force: true });
      }
    });

    it("returns undefined when service not in home config", async () => {
      const savedCwd = await readFileOrUndefined(CWD_CONFIG_PATH);
      const savedHome = await readFileOrUndefined(HOME_CONFIG_PATH);
      try {
        // Remove cwd config so only home config is checked
        await fs.rm(CWD_CONFIG_PATH, { force: true });

        const configContent = JSON.stringify({
          solr: { baseUrl: "https://solr.example.com" },
        });
        await fs.writeFile(HOME_CONFIG_PATH, configContent);

        const result = await loadConfig({ service: "dsl" }, DslConfigSchema);

        expect(result).toBeUndefined();
      } finally {
        await restoreFile(HOME_CONFIG_PATH, savedHome);
        await restoreFile(CWD_CONFIG_PATH, savedCwd);
      }
    });

    it("returns undefined when no config found anywhere", async () => {
      const savedCwd = await readFileOrUndefined(CWD_CONFIG_PATH);
      const savedHome = await readFileOrUndefined(HOME_CONFIG_PATH);
      try {
        await fs.rm(CWD_CONFIG_PATH, { force: true });
        await fs.rm(HOME_CONFIG_PATH, { force: true });

        const result = await loadConfig({ service: "dsl" }, DslConfigSchema);
        expect(result).toBeUndefined();
      } finally {
        await restoreFile(HOME_CONFIG_PATH, savedHome);
        await restoreFile(CWD_CONFIG_PATH, savedCwd);
      }
    });
  });

  describe("priority order", () => {
    it("prefers explicit config over env vars and file configs", async () => {
      const savedCwd = await readFileOrUndefined(CWD_CONFIG_PATH);
      try {
        // Set up all sources
        process.env.DIMENSIONS_DSL_API_KEY = "env-key";

        await fs.writeFile(
          CWD_CONFIG_PATH,
          JSON.stringify({
            dsl: { apiKey: "cwd-key" },
          }),
        );

        const explicitConfigPath = path.join(tempDir, "explicit.json");
        await fs.writeFile(
          explicitConfigPath,
          JSON.stringify({
            dsl: { apiKey: "explicit-key" },
          }),
        );

        const result = await loadConfig(
          { configPath: explicitConfigPath, service: "dsl" },
          DslConfigSchema,
        );

        expect(result?.source).toBe("explicit");
        expect(result?.config.apiKey).toBe("explicit-key");
      } finally {
        await restoreFile(CWD_CONFIG_PATH, savedCwd);
      }
    });

    it("prefers env vars over cwd and home configs", async () => {
      const savedCwd = await readFileOrUndefined(CWD_CONFIG_PATH);
      try {
        process.env.DIMENSIONS_DSL_API_KEY = "env-key";

        await fs.writeFile(
          CWD_CONFIG_PATH,
          JSON.stringify({
            dsl: { apiKey: "cwd-key" },
          }),
        );

        const result = await loadConfig({ service: "dsl" }, DslConfigSchema);

        expect(result?.source).toBe("env");
        expect(result?.config.apiKey).toBe("env-key");
      } finally {
        await restoreFile(CWD_CONFIG_PATH, savedCwd);
      }
    });

    it("prefers cwd config over home config", async () => {
      const savedCwd = await readFileOrUndefined(CWD_CONFIG_PATH);
      const savedHome = await readFileOrUndefined(HOME_CONFIG_PATH);
      try {
        await fs.writeFile(
          CWD_CONFIG_PATH,
          JSON.stringify({
            dsl: { apiKey: "cwd-key" },
          }),
        );

        await fs.writeFile(
          HOME_CONFIG_PATH,
          JSON.stringify({
            dsl: { apiKey: "home-key" },
          }),
        );

        const result = await loadConfig({ service: "dsl" }, DslConfigSchema);

        expect(result?.source).toBe("cwd");
        expect(result?.config.apiKey).toBe("cwd-key");
      } finally {
        await restoreFile(CWD_CONFIG_PATH, savedCwd);
        await restoreFile(HOME_CONFIG_PATH, savedHome);
      }
    });
  });
});
