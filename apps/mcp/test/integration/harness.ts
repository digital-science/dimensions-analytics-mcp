/**
 * MCP eval harness runner.
 *
 * Creates a real MCP server with live API credentials, connects an MCP Client
 * via in-memory transport, and executes eval suites against it.
 * @module test/integration/harness
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServerAsync, type McpServerConfig } from "../../src/mcp/server.js";
import { missingEnvVars } from "./env.js";
import type {
  AssertionResult,
  CaseResult,
  EvalCase,
  EvalRunResult,
  EvalSuite,
  SuiteResult,
} from "./types.js";

const DEFAULT_TIMEOUT = 30_000;

/**
 * Configuration for the eval harness.
 */
export interface EvalHarnessConfig {
  /** MCP server config (API keys, URLs). Defaults to env vars. */
  readonly serverConfig?: McpServerConfig;
  /** Only run suites whose names match these (empty = all). */
  readonly suiteFilter?: readonly string[];
  /** Only run cases tagged with one of these (empty = all). */
  readonly tagFilter?: readonly string[];
  /** Exclude cases tagged with one of these. */
  readonly tagExclude?: readonly string[];
  /** Max concurrent cases per suite (default: 1 — sequential). */
  readonly concurrency?: number;
}

/**
 * Parses the JSON text from an MCP tool call result.
 * @param result - Raw MCP callTool result
 * @returns Parsed JSON data
 */
function parseResult(result: { content: Array<{ type: string; text?: string }> }): unknown {
  const textContent = result.content.find((c) => c.type === "text" && c.text);
  if (!textContent || !("text" in textContent) || !textContent.text) {
    throw new Error("Tool result has no text content");
  }
  return JSON.parse(textContent.text);
}

/**
 * Reads a resource via the MCP client and returns it as a tool-like result.
 * @param client - Connected MCP client
 * @param uri - Resource URI
 * @returns Parsed resource content
 */
async function readResource(client: Client, uri: string): Promise<unknown> {
  const result = await client.readResource({ uri });
  const textContent = result.contents.find((c) => c.mimeType === "application/json" || c.text);
  if (!textContent || !("text" in textContent) || !textContent.text) {
    throw new Error("Resource has no text content");
  }
  return JSON.parse(textContent.text as string);
}

/**
 * Runs a single eval case against the MCP client.
 * @param client - Connected MCP client
 * @param suiteName - Parent suite name
 * @param evalCase - The case to run
 * @returns Case result
 */
async function runCase(client: Client, suiteName: string, evalCase: EvalCase): Promise<CaseResult> {
  const start = performance.now();
  const timeout = evalCase.timeout ?? DEFAULT_TIMEOUT;

  try {
    // Handle resource reads (sentinel tool name)
    if (evalCase.tool === "__resource__") {
      const uri = evalCase.args.uri as string;
      const data = await Promise.race([
        readResource(client, uri),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Timeout after ${timeout}ms`)), timeout),
        ),
      ]);
      const assertions: AssertionResult[] = evalCase.assertions.map((assertion) => {
        try {
          const checkResult = assertion.check(data);
          return checkResult === true
            ? { label: assertion.label, passed: true }
            : { label: assertion.label, passed: false, error: checkResult };
        } catch (err) {
          return {
            label: assertion.label,
            passed: false,
            error: `Assertion threw: ${err instanceof Error ? err.message : String(err)}`,
          };
        }
      });
      return {
        suiteName,
        caseName: evalCase.name,
        tool: `resource:${uri}`,
        passed: assertions.every((a) => a.passed),
        assertions,
        durationMs: performance.now() - start,
      };
    }

    const result = await Promise.race([
      client.callTool({ name: evalCase.tool, arguments: evalCase.args }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout after ${timeout}ms`)), timeout),
      ),
    ]);

    // Check if the tool returned an error
    if ("isError" in result && result.isError) {
      const parsed = parseResult(result as { content: Array<{ type: string; text?: string }> });
      const errorMsg =
        parsed && typeof parsed === "object" && "error" in parsed
          ? String((parsed as Record<string, unknown>).error)
          : "Unknown tool error";
      return {
        suiteName,
        caseName: evalCase.name,
        tool: evalCase.tool,
        passed: false,
        assertions: [],
        durationMs: performance.now() - start,
        toolError: errorMsg,
      };
    }

    const data = parseResult(result as { content: Array<{ type: string; text?: string }> });

    // Run assertions
    const assertions: AssertionResult[] = evalCase.assertions.map((assertion) => {
      try {
        const checkResult = assertion.check(data);
        return checkResult === true
          ? { label: assertion.label, passed: true }
          : { label: assertion.label, passed: false, error: checkResult };
      } catch (err) {
        return {
          label: assertion.label,
          passed: false,
          error: `Assertion threw: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    });

    return {
      suiteName,
      caseName: evalCase.name,
      tool: evalCase.tool,
      passed: assertions.every((a) => a.passed),
      assertions,
      durationMs: performance.now() - start,
    };
  } catch (err) {
    return {
      suiteName,
      caseName: evalCase.name,
      tool: evalCase.tool,
      passed: false,
      assertions: [],
      durationMs: performance.now() - start,
      toolError: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Checks whether required credentials for a suite are present. */
function missingCredentials(suite: EvalSuite, serverConfig?: McpServerConfig): string[] {
  if (!suite.requiredEnvVars) return [];
  return missingEnvVars(suite.requiredEnvVars).filter((v) => {
    if (v === "DIMENSIONS_API_KEY") {
      return !(process.env.DIMENSIONS_API_KEY ?? serverConfig?.apiKey);
    }
    return true;
  });
}

/**
 * Filters cases by tag include/exclude rules.
 * @param cases - All cases in a suite
 * @param config - Harness config with tag filters
 * @returns Filtered cases
 */
function filterCases(cases: readonly EvalCase[], config: EvalHarnessConfig): readonly EvalCase[] {
  let filtered = [...cases];

  if (config.tagFilter && config.tagFilter.length > 0) {
    filtered = filtered.filter((c) => c.tags?.some((t) => config.tagFilter?.includes(t)));
  }

  if (config.tagExclude && config.tagExclude.length > 0) {
    filtered = filtered.filter(
      (c) => !c.tags || !c.tags.some((t) => config.tagExclude?.includes(t)),
    );
  }

  return filtered;
}

/**
 * Runs all eval suites against an already-connected MCP client.
 * @param client - Connected MCP client
 * @param suites - Array of eval suites to run
 * @param config - Harness configuration
 * @returns Full eval run result
 */
export async function runEvalsWithClient(
  client: Client,
  suites: readonly EvalSuite[],
  config: EvalHarnessConfig = {},
): Promise<EvalRunResult> {
  const runStart = performance.now();

  const activeSuites =
    config.suiteFilter && config.suiteFilter.length > 0
      ? suites.filter((s) => config.suiteFilter?.includes(s.name))
      : [...suites];

  const suiteResults: SuiteResult[] = [];

  for (const suite of activeSuites) {
    const suiteStart = performance.now();

    const missing = missingCredentials(suite, config.serverConfig);
    if (missing.length > 0) {
      const skippedCases: CaseResult[] = suite.cases.map((c) => ({
        suiteName: suite.name,
        caseName: c.name,
        tool: c.tool,
        passed: false,
        assertions: [],
        durationMs: 0,
        skipped: true,
        skipReason: `Missing env vars: ${missing.join(", ")}`,
      }));
      suiteResults.push({
        name: suite.name,
        cases: skippedCases,
        passed: 0,
        failed: 0,
        skipped: skippedCases.length,
        durationMs: 0,
      });
      continue;
    }

    const cases = filterCases(suite.cases, config);
    const caseResults: CaseResult[] = [];

    for (const evalCase of cases) {
      const result = await runCase(client, suite.name, evalCase);
      caseResults.push(result);
    }

    suiteResults.push({
      name: suite.name,
      cases: caseResults,
      passed: caseResults.filter((c) => c.passed).length,
      failed: caseResults.filter((c) => !c.passed && !c.skipped).length,
      skipped: caseResults.filter((c) => c.skipped).length,
      durationMs: performance.now() - suiteStart,
    });
  }

  return {
    suites: suiteResults,
    totalPassed: suiteResults.reduce((sum, s) => sum + s.passed, 0),
    totalFailed: suiteResults.reduce((sum, s) => sum + s.failed, 0),
    totalSkipped: suiteResults.reduce((sum, s) => sum + s.skipped, 0),
    durationMs: performance.now() - runStart,
  };
}

/**
 * Runs all eval suites and returns aggregate results.
 * @param suites - Array of eval suites to run
 * @param config - Harness configuration
 * @returns Full eval run result
 */
export async function runEvals(
  suites: readonly EvalSuite[],
  config: EvalHarnessConfig = {},
): Promise<EvalRunResult> {
  const { server } = await createMcpServerAsync(config.serverConfig ?? {});
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "eval-harness", version: "1.0.0" });

  await server.connect(serverTransport);
  await client.connect(clientTransport);

  const result = await runEvalsWithClient(client, suites, config);

  await client.close();
  await server.close();

  return result;
}
