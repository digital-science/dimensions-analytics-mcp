/**
 * Test configuration loader for integration tests.
 * Loads API credentials from environment or config file.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface TestConfig {
  apiKey: string;
  baseUrl?: string;
}

/**
 * Loads test configuration from environment variables or config file.
 */
export function loadTestConfig(): TestConfig | undefined {
  // Priority 1: Environment variables
  if (process.env.DIMENSIONS_API_KEY) {
    return {
      apiKey: process.env.DIMENSIONS_API_KEY,
      baseUrl: process.env.DIMENSIONS_BASE_URL,
    };
  }

  // Priority 2: Config file in project root
  const configPaths = [
    join(process.cwd(), ".dimensions.config.json"),
    join(process.cwd(), ".dimensions.config.json"),
    join(process.cwd(), "apps", "mcp", ".dimensions.config.json"),
  ];

  for (const configPath of configPaths) {
    if (existsSync(configPath)) {
      try {
        const content = readFileSync(configPath, "utf-8");
        const config = JSON.parse(content);
        // Config uses nested structure: { dsl: { apiKey, baseUrl } }
        if (config.dsl?.apiKey) {
          return {
            apiKey: config.dsl.apiKey,
            baseUrl: config.dsl.baseUrl,
          };
        }
      } catch {
        // Continue to next path
      }
    }
  }

  return undefined;
}
