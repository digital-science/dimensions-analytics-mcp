/**
 * Console reporter for MCP eval results.
 * @module test/integration/reporter
 */

import type { CaseResult, EvalRunResult, SuiteResult } from "./types.js";

const PASS = "\x1b[32m PASS \x1b[0m";
const FAIL = "\x1b[31m FAIL \x1b[0m";
const SKIP = "\x1b[33m SKIP \x1b[0m";

/**
 * Formats a duration in milliseconds to a human-readable string.
 * @param ms - Duration in milliseconds
 * @returns Formatted string (e.g., "1.2s", "450ms")
 */
function formatDuration(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms)}ms`;
}

/**
 * Prints a single case result to stderr.
 * @param result - The case result to print
 */
function printCase(result: CaseResult): void {
  if (result.skipped) {
    console.error(`  ${SKIP} ${result.caseName} — ${result.skipReason}`);
    return;
  }

  const badge = result.passed ? PASS : FAIL;
  const duration = formatDuration(result.durationMs);
  console.error(`  ${badge} ${result.caseName} (${duration})`);

  if (result.toolError) {
    console.error(`         Tool error: ${result.toolError}`);
    return;
  }

  for (const assertion of result.assertions) {
    if (!assertion.passed) {
      console.error(`         \x1b[31m✗\x1b[0m ${assertion.label}`);
      if (assertion.error) {
        console.error(`           ${assertion.error}`);
      }
    }
  }
}

/**
 * Prints a suite result to stderr.
 * @param suite - The suite result to print
 */
function printSuite(suite: SuiteResult): void {
  const duration = formatDuration(suite.durationMs);
  const counts = [
    suite.passed > 0 ? `\x1b[32m${suite.passed} passed\x1b[0m` : null,
    suite.failed > 0 ? `\x1b[31m${suite.failed} failed\x1b[0m` : null,
    suite.skipped > 0 ? `\x1b[33m${suite.skipped} skipped\x1b[0m` : null,
  ]
    .filter(Boolean)
    .join(", ");

  console.error(`\n\x1b[1m${suite.name}\x1b[0m (${counts}) ${duration}`);

  for (const c of suite.cases) {
    printCase(c);
  }
}

/**
 * Prints the full eval run report to stderr.
 * @param result - The eval run result
 */
export function printReport(result: EvalRunResult): void {
  console.error("\n\x1b[1m═══ MCP Eval Report ═══\x1b[0m\n");

  for (const suite of result.suites) {
    printSuite(suite);
  }

  const total = result.totalPassed + result.totalFailed + result.totalSkipped;
  const duration = formatDuration(result.durationMs);

  console.error("\n\x1b[1m───────────────────────\x1b[0m");
  console.error(
    `Total: ${total} cases | \x1b[32m${result.totalPassed} passed\x1b[0m | \x1b[31m${result.totalFailed} failed\x1b[0m | \x1b[33m${result.totalSkipped} skipped\x1b[0m | ${duration}`,
  );
  console.error("");
}

/**
 * Returns process exit code based on results: 0 if all passed/skipped, 1 if any failed.
 * @param result - The eval run result
 * @returns Exit code
 */
export function exitCode(result: EvalRunResult): number {
  return result.totalFailed > 0 ? 1 : 0;
}
