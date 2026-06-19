/**
 * Dimensions reasonable-use policy guardrails for MCP tools.
 * @see https://docs.dimensions.ai/dsl/usagepolicy.html
 * @module dsl/usage-policy
 */

import { ValidationError } from "../client/index.js";
import {
  CONFIRM_LARGE_FETCH_PAGES,
  CONFIRM_LARGE_FETCH_RECORDS,
  LARGE_RESULT_THRESHOLD,
  largeResultWarning,
  validatePaginationBounds,
} from "./pagination.js";
import { SCHEMA_LIMITS } from "./schema/store.js";

/** Official Dimensions usage policy URL. */
export const USAGE_POLICY_URL = "https://docs.dimensions.ai/dsl/usagepolicy.html";

/** MCP resource URI for policy guidance. */
export const USAGE_POLICY_RESOURCE_URI = "dimensions://schema/policy";

/** Short notice included in guarded tool responses. */
export const POLICY_NOTICE =
  "Dimensions API is for task-sized analytical queries, not bulk local copies or training data. " +
  `See ${USAGE_POLICY_RESOURCE_URI} and ${USAGE_POLICY_URL}.`;

/** Parsed skip/limit modifiers from a DSL query string. */
export type DslPaginationModifiers = {
  readonly limit?: number;
  readonly skip?: number;
};

/** Payload for dimensions://schema/policy. */
export type UsagePolicyPayload = {
  readonly source: string;
  readonly purpose: string;
  readonly limits: typeof SCHEMA_LIMITS;
  readonly guardrails: {
    readonly largeResultWarningThreshold: number;
    readonly confirmLargeFetchRequiredWhen: {
      readonly batchMaxPagesExceeds: number;
      readonly batchRecordsExceeds: number;
      readonly searchSkipAtLeast: number;
      readonly searchPageAtLeast: number;
    };
    readonly clientRateLimitPerMinute: number;
  };
  readonly recommendations: readonly string[];
  readonly notice: string;
};

/**
 * Builds the usage policy payload for MCP resources and agent discovery.
 * @returns Policy guidance object
 */
export function buildUsagePolicy(): UsagePolicyPayload {
  return {
    source: USAGE_POLICY_URL,
    purpose:
      "Support complex analytical tasks — not local copies of Dimensions data, training corpora, or open-ended crawling.",
    limits: SCHEMA_LIMITS,
    guardrails: {
      largeResultWarningThreshold: LARGE_RESULT_THRESHOLD,
      confirmLargeFetchRequiredWhen: {
        batchMaxPagesExceeds: CONFIRM_LARGE_FETCH_PAGES,
        batchRecordsExceeds: CONFIRM_LARGE_FETCH_RECORDS,
        searchSkipAtLeast: CONFIRM_LARGE_FETCH_RECORDS,
        searchPageAtLeast: CONFIRM_LARGE_FETCH_PAGES,
      },
      clientRateLimitPerMinute: SCHEMA_LIMITS.requestsPerMinute,
    },
    recommendations: [
      "Start with narrow filters and facet_query before paginating large sets",
      "Use search_* with default limit 100 for discovery; raise only when needed",
      "Use fetch_search_pages aggregate mode for ID lists and counts without full rows",
      "Use fetch_search_pages file mode (JSONL or CSV) only with outputPath and confirmLargeFetch for large exports",
      "Facets return at most 1000 buckets with no pagination — do not loop facet queries",
    ],
    notice: POLICY_NOTICE,
  };
}

/**
 * Extracts `limit` and `skip` modifiers from a DSL query string.
 * @param dsl - Raw DSL query
 * @returns Parsed modifiers (undefined when absent)
 */
export function parseDslPagination(dsl: string): DslPaginationModifiers {
  const limitMatch = dsl.match(/\blimit\s+(\d+)\b/i);
  const skipMatch = dsl.match(/\bskip\s+(\d+)\b/i);
  return {
    ...(limitMatch ? { limit: Number.parseInt(limitMatch[1], 10) } : {}),
    ...(skipMatch ? { skip: Number.parseInt(skipMatch[1], 10) } : {}),
  };
}

/**
 * Returns true when the DSL appears to be a facet-only query (no entity row pagination).
 * @param dsl - Raw DSL query
 * @returns Whether the query targets facets without entity records
 */
export function isFacetOnlyQuery(dsl: string): boolean {
  const hasFacetReturn =
    /\breturn\s+(?:year|journal|funder|researcher|category|phase|source|repository|funder_orgs?)\b/i.test(
      dsl,
    ) ||
    /\breturn\s+\w+\s+facet\b/i.test(dsl) ||
    /\bfacet\s+\w+/i.test(dsl);
  const hasEntityReturn =
    /\breturn\s+(?:publications|grants|patents|clinical_trials|datasets|policy_documents|researchers|organizations)\b/i.test(
      dsl,
    );
  const limitZero = /\blimit\s+0\b/i.test(dsl);
  return hasFacetReturn && (!hasEntityReturn || limitZero);
}

/** Options for single-page search policy validation. */
export type SearchPolicyOptions = {
  readonly skip: number;
  readonly limit: number;
  readonly confirmLargeFetch?: boolean;
};

/**
 * Validates single-page search pagination against reasonable-use guardrails.
 * @param options - Resolved skip/limit and optional confirmation flag
 * @throws {ValidationError} When deep pagination lacks confirmation
 */
export function validateSearchPaginationPolicy(options: SearchPolicyOptions): void {
  const { skip, limit, confirmLargeFetch } = options;
  const page = limit > 0 ? Math.floor(skip / limit) : 0;

  const needsConfirm =
    skip >= CONFIRM_LARGE_FETCH_RECORDS ||
    page >= CONFIRM_LARGE_FETCH_PAGES ||
    (limit === SCHEMA_LIMITS.maxLimit && skip > 0);

  if (needsConfirm && !confirmLargeFetch) {
    throw new ValidationError(
      `Deep pagination requires confirmLargeFetch: true (skip=${skip}, limit=${limit}, page≈${page}). ` +
        "Narrow filters first or use facet_query. See dimensions://schema/policy.",
      { skip, limit, page, confirmLargeFetch, policyUri: USAGE_POLICY_RESOURCE_URI },
    );
  }
}

/** Options for raw DSL policy validation. */
export type ExecuteDslPolicyOptions = {
  readonly dsl: string;
  readonly confirmLargeFetch?: boolean;
};

/**
 * Validates a raw DSL query against pagination and reasonable-use guardrails.
 * @param options - DSL string and optional confirmation flag
 * @throws {ValidationError} When the query violates policy bounds
 */
export function validateExecuteDslPolicy(options: ExecuteDslPolicyOptions): void {
  const { dsl, confirmLargeFetch } = options;
  const { limit, skip } = parseDslPagination(dsl);

  if (isFacetOnlyQuery(dsl) && skip !== undefined && skip > 0) {
    throw new ValidationError(
      "Facet queries cannot be paginated with skip — facets return at most 1000 buckets with no pagination.",
      { skip, policyUri: USAGE_POLICY_RESOURCE_URI },
    );
  }

  if (skip !== undefined || limit !== undefined) {
    validatePaginationBounds(skip ?? 0, limit ?? SCHEMA_LIMITS.maxLimit);
    validateSearchPaginationPolicy({
      skip: skip ?? 0,
      limit: limit ?? 100,
      confirmLargeFetch,
    });
  }
}

/**
 * Builds response-level policy hints for execute_dsl results.
 * @param dsl - Executed DSL query
 * @param response - Raw API response
 * @returns Optional policy fields to merge into the tool result
 */
export function buildExecuteDslPolicyHints(
  dsl: string,
  response: Record<string, unknown>,
): {
  policyNotice?: string;
  largeResultWarning?: string;
  paginationHint?: string;
} {
  const stats = response._stats as { total_count?: number } | undefined;
  const totalCount = stats?.total_count;
  const hints: {
    policyNotice?: string;
    largeResultWarning?: string;
    paginationHint?: string;
  } = {};

  const warning = totalCount !== undefined ? largeResultWarning(totalCount) : undefined;
  if (warning) {
    hints.largeResultWarning = warning;
    hints.policyNotice = POLICY_NOTICE;
  }

  const { limit, skip } = parseDslPagination(dsl);
  if (totalCount !== undefined && limit !== undefined && totalCount > (skip ?? 0) + limit) {
    const pages = Math.ceil(totalCount / limit);
    const minutes = Math.ceil(pages / SCHEMA_LIMITS.requestsPerMinute);
    hints.paginationHint =
      `${totalCount} total matches; this page returned up to ${limit}. ` +
      `Full pagination ≈${pages} requests (~${minutes} min). Prefer search_* or fetch_search_pages.`;
    hints.policyNotice ??= POLICY_NOTICE;
  }

  return hints;
}
