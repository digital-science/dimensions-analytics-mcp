/**
 * Core types for the MCP evaluation harness.
 *
 * Each eval suite defines a set of cases that exercise MCP tools against the
 * live Dimensions API and verify response correctness with assertions.
 * @module test/integration/types
 */

/** A single assertion to run against a tool result. */
export interface Assertion {
  /** Human-readable label shown in reports. */
  readonly label: string;
  /**
   * Evaluates the assertion against parsed tool output.
   * @param data - Parsed JSON from the tool result
   * @returns `true` if the assertion passes, or an error message string
   */
  readonly check: (data: unknown) => true | string;
}

/** A single evaluation case — one tool call plus its expected assertions. */
export interface EvalCase {
  /** Short descriptive name for the case (e.g., "CRISPR DOI lookup"). */
  readonly name: string;
  /** MCP tool name to invoke. */
  readonly tool: string;
  /** Arguments passed to the tool. */
  readonly args: Record<string, unknown>;
  /** Assertions that must all pass for the case to succeed. */
  readonly assertions: readonly Assertion[];
  /** Optional tags for filtering (e.g., "slow", "optional-api-key"). */
  readonly tags?: readonly string[];
  /** Timeout in ms for the tool call (default: 30_000). */
  readonly timeout?: number;
}

/** An evaluation suite — a named group of related cases. */
export interface EvalSuite {
  /** Suite name (e.g., "search", "lookup"). */
  readonly name: string;
  /** Suite description. */
  readonly description: string;
  /** Eval cases in this suite. */
  readonly cases: readonly EvalCase[];
  /**
   * Optional API keys this suite requires beyond the base Dimensions key.
   * If any are missing from the environment, the suite is skipped.
   */
  readonly requiredEnvVars?: readonly string[];
}

/** Result of a single assertion check. */
export interface AssertionResult {
  readonly label: string;
  readonly passed: boolean;
  readonly error?: string;
}

/** Result of a single eval case. */
export interface CaseResult {
  readonly suiteName: string;
  readonly caseName: string;
  readonly tool: string;
  readonly passed: boolean;
  readonly assertions: readonly AssertionResult[];
  /** Wall-clock duration in ms. */
  readonly durationMs: number;
  /** Set if the tool call itself failed (threw or returned isError). */
  readonly toolError?: string;
  /** Whether the case was skipped (e.g., missing env var). */
  readonly skipped?: boolean;
  readonly skipReason?: string;
}

/** Aggregate result for an entire suite. */
export interface SuiteResult {
  readonly name: string;
  readonly cases: readonly CaseResult[];
  readonly passed: number;
  readonly failed: number;
  readonly skipped: number;
  readonly durationMs: number;
}

/** Aggregate result for the full eval run. */
export interface EvalRunResult {
  readonly suites: readonly SuiteResult[];
  readonly totalPassed: number;
  readonly totalFailed: number;
  readonly totalSkipped: number;
  readonly durationMs: number;
}
