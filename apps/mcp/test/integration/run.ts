#!/usr/bin/env node

/**
 * CLI entry point for the MCP integration test harness.
 *
 * Usage:
 *   node --import tsx apps/mcp/test/integration/run.ts [--suite <name>] [--tag <tag>] [--exclude <tag>]
 *
 * Reads API keys from .dimensions.config.json (cwd → home fallback),
 * with env var overrides.
 * @module test/integration/run
 */

import type { McpServerConfig } from "../../src/mcp/server.js";
import { loadLocalIntegrationConfig } from "./env.js";
import { type EvalHarnessConfig, runEvals } from "./harness.js";
import { exitCode, printReport } from "./reporter.js";
import { allSuites } from "./suites/index.js";

/**
 * Loads MCP server config from env / .dimensions.config.json.
 */
async function loadServerConfig(): Promise<McpServerConfig> {
  const fromEnv = loadLocalIntegrationConfig();
  if (fromEnv) {
    return {
      apiKey: fromEnv.apiKey,
      baseUrl: fromEnv.baseUrl,
    };
  }

  const { loadDimensionsConfig } = await import("../../src/client/config/node.js");
  const fileConfig = await loadDimensionsConfig();
  return {
    apiKey: fileConfig?.dsl?.apiKey,
    baseUrl: fileConfig?.dsl?.baseUrl,
  };
}

function parseArgs(argv: string[]): Omit<EvalHarnessConfig, "serverConfig"> {
  const suiteFilter: string[] = [];
  const tagFilter: string[] = [];
  const tagExclude: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--suite" && next) {
      suiteFilter.push(next);
      i++;
    } else if (arg === "--tag" && next) {
      tagFilter.push(next);
      i++;
    } else if (arg === "--exclude" && next) {
      tagExclude.push(next);
      i++;
    }
  }

  return {
    suiteFilter: suiteFilter.length > 0 ? suiteFilter : undefined,
    tagFilter: tagFilter.length > 0 ? tagFilter : undefined,
    tagExclude: tagExclude.length > 0 ? tagExclude : undefined,
  };
}

const serverConfig = await loadServerConfig();
const config: EvalHarnessConfig = { ...parseArgs(process.argv.slice(2)), serverConfig };

console.error(`Running ${allSuites.length} integration test suites...\n`);

const result = await runEvals(allSuites, config);
printReport(result);
process.exit(exitCode(result));
