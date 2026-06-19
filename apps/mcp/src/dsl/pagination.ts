/**
 * Pagination helpers aligned with Dimensions DSL operational limits.
 * @see https://docs.dimensions.ai/dsl/usagepolicy.html
 * @module dsl/pagination
 */

import { ValidationError } from "../client/index.js";
import { SCHEMA_LIMITS } from "./schema/store.js";

/** Soft warning threshold for very large result sets. */
export const LARGE_RESULT_THRESHOLD = 10_000;

/** Default pages per batch invocation (single page). */
export const DEFAULT_BATCH_MAX_PAGES = 1;

/** Hard cap on pages per batch invocation. */
export const HARD_MAX_BATCH_PAGES = 50;

/** Pages above this require `confirmLargeFetch`. */
export const CONFIRM_LARGE_FETCH_PAGES = 5;

/** Records above this require `confirmLargeFetch`. */
export const CONFIRM_LARGE_FETCH_RECORDS = 5_000;

/** Max IDs returned in aggregate mode before truncation. */
export const AGGREGATE_ID_CAP = 500;

/** Metadata describing pagination state for search tool responses. */
export interface PaginationMetadata {
  readonly pageSize: number;
  readonly skip: number;
  readonly page: number;
  readonly nextSkip: number | null;
  readonly maxPageSize: number;
  readonly maxTotalRecords: number;
  readonly maxPagesRemaining: number;
  readonly estimatedRequestsToFetchAll: number;
  readonly estimatedMinutesToFetchAll: number;
}

/** Arguments for resolving skip/limit from tool input. */
export type PaginationInput = {
  readonly skip?: number;
  readonly page?: number;
  readonly limit?: number;
  readonly pageSize?: number;
};

/**
 * Validates that skip/limit stay within Dimensions pagination bounds.
 * @param skip - Records to skip
 * @param limit - Page size
 * @throws {ValidationError} When out of bounds
 */
export function validatePaginationBounds(skip: number, limit: number): void {
  if (limit < 1 || limit > SCHEMA_LIMITS.maxLimit) {
    throw new ValidationError(`limit must be between 1 and ${SCHEMA_LIMITS.maxLimit}`, {
      limit,
      maxLimit: SCHEMA_LIMITS.maxLimit,
    });
  }
  if (skip < 0) {
    throw new ValidationError("skip must be non-negative", { skip });
  }
  if (skip + limit > SCHEMA_LIMITS.maxOffset) {
    throw new ValidationError(
      `skip + limit cannot exceed ${SCHEMA_LIMITS.maxOffset} (max paginated records)`,
      { skip, limit, maxOffset: SCHEMA_LIMITS.maxOffset },
    );
  }
}

/**
 * Resolves skip and limit from tool arguments (`skip`, `page`, `limit`, or `pageSize`).
 * @param args - Pagination-related tool arguments
 * @returns Resolved skip and limit
 * @throws {ValidationError} When both skip and page are set or bounds are invalid
 */
export function resolveSkipAndLimit(args: PaginationInput): { skip: number; limit: number } {
  const limit = args.pageSize ?? args.limit ?? 100;
  let skip = 0;
  if (args.skip !== undefined) {
    skip = args.skip;
  } else if (args.page !== undefined) {
    if (args.page < 0 || args.page >= SCHEMA_LIMITS.maxPages) {
      throw new ValidationError(`page must be between 0 and ${SCHEMA_LIMITS.maxPages - 1}`, {
        page: args.page,
        maxPages: SCHEMA_LIMITS.maxPages,
      });
    }
    skip = args.page * limit;
  }

  validatePaginationBounds(skip, limit);
  return { skip, limit };
}

/**
 * Builds pagination metadata for a search response.
 * @param skip - Current skip offset
 * @param pageSize - Current page size
 * @param totalCount - Total matching records from the API
 * @returns Pagination metadata block
 */
export function buildPaginationMetadata(
  skip: number,
  pageSize: number,
  totalCount: number,
): PaginationMetadata {
  const page = Math.floor(skip / pageSize);
  const fetchedThrough = skip + pageSize;
  const hasMore = totalCount > fetchedThrough;
  const nextSkip = hasMore ? fetchedThrough : null;
  const remainingRecords = Math.max(0, totalCount - fetchedThrough);
  const maxPagesRemaining = Math.min(
    SCHEMA_LIMITS.maxPages - (page + 1),
    Math.ceil(remainingRecords / pageSize),
  );
  const estimatedRequestsToFetchAll = Math.ceil(totalCount / pageSize);
  const estimatedMinutesToFetchAll = Math.ceil(
    estimatedRequestsToFetchAll / SCHEMA_LIMITS.requestsPerMinute,
  );

  return {
    pageSize,
    skip,
    page,
    nextSkip,
    maxPageSize: SCHEMA_LIMITS.maxLimit,
    maxTotalRecords: SCHEMA_LIMITS.maxOffset,
    maxPagesRemaining,
    estimatedRequestsToFetchAll,
    estimatedMinutesToFetchAll,
  };
}

/**
 * Returns a soft warning when totalCount exceeds {@link LARGE_RESULT_THRESHOLD}.
 * @param totalCount - Total matching records
 * @returns Warning string or undefined
 */
export function largeResultWarning(totalCount: number): string | undefined {
  if (totalCount <= LARGE_RESULT_THRESHOLD) return undefined;
  const pages = Math.ceil(totalCount / SCHEMA_LIMITS.maxLimit);
  const minutes = Math.ceil(pages / SCHEMA_LIMITS.requestsPerMinute);
  return (
    `${totalCount.toLocaleString()} matches — narrow filters or use facets first. ` +
    `Full pagination needs ~${pages} requests (~${minutes} min at ${SCHEMA_LIMITS.requestsPerMinute}/min).`
  );
}

/** Options for validating a multi-page batch request. */
export type BatchPaginationOptions = {
  readonly startPage: number;
  readonly maxPages: number;
  readonly pageSize: number;
  readonly maxRecords?: number;
  readonly confirmLargeFetch?: boolean;
};

/**
 * Validates multi-page batch parameters against policy guardrails.
 * @param options - Batch request options
 * @throws {ValidationError} When limits are exceeded or confirmation is required
 */
export function validateBatchPagination(options: BatchPaginationOptions): void {
  const { startPage, maxPages, pageSize, maxRecords, confirmLargeFetch } = options;

  if (maxPages < 1 || maxPages > HARD_MAX_BATCH_PAGES) {
    throw new ValidationError(`maxPages must be between 1 and ${HARD_MAX_BATCH_PAGES}`, {
      maxPages,
      hardMax: HARD_MAX_BATCH_PAGES,
    });
  }
  if (startPage < 0 || startPage >= SCHEMA_LIMITS.maxPages) {
    throw new ValidationError(`startPage must be between 0 and ${SCHEMA_LIMITS.maxPages - 1}`, {
      startPage,
    });
  }

  validatePaginationBounds(startPage * pageSize, pageSize);

  const endSkip = startPage * pageSize + maxPages * pageSize;
  if (endSkip > SCHEMA_LIMITS.maxOffset) {
    throw new ValidationError(
      `startPage + maxPages exceeds max paginated records (${SCHEMA_LIMITS.maxOffset})`,
      { startPage, maxPages, pageSize, maxOffset: SCHEMA_LIMITS.maxOffset },
    );
  }

  const recordsPlanned = Math.min(maxPages * pageSize, maxRecords ?? maxPages * pageSize);
  const needsConfirm =
    maxPages > CONFIRM_LARGE_FETCH_PAGES || recordsPlanned > CONFIRM_LARGE_FETCH_RECORDS;

  if (needsConfirm && !confirmLargeFetch) {
    throw new ValidationError(
      `Large fetch requires confirmLargeFetch: true (maxPages=${maxPages}, ~${recordsPlanned} records). ` +
        "Narrow filters or use aggregate mode for summaries.",
      { maxPages, recordsPlanned, confirmLargeFetch },
    );
  }
}
