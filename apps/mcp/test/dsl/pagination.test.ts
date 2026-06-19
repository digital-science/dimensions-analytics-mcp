/**
 * Tests for Dimensions pagination helpers.
 * @module test/dsl/pagination
 */

import { describe, expect, it } from "vitest";
import { ValidationError } from "../../src/client/index.js";
import {
  buildPaginationMetadata,
  CONFIRM_LARGE_FETCH_PAGES,
  resolveSkipAndLimit,
  validateBatchPagination,
  validatePaginationBounds,
} from "../../src/dsl/pagination.js";

describe("pagination helpers", () => {
  describe("resolveSkipAndLimit", () => {
    it("defaults to skip 0 and limit 100", () => {
      expect(resolveSkipAndLimit({})).toEqual({ skip: 0, limit: 100 });
    });

    it("computes skip from page", () => {
      expect(resolveSkipAndLimit({ page: 2, limit: 500 })).toEqual({ skip: 1000, limit: 500 });
    });

    it("prefers skip when skip and page are both set", () => {
      expect(resolveSkipAndLimit({ skip: 100, page: 1, limit: 100 })).toEqual({
        skip: 100,
        limit: 100,
      });
    });

    it("rejects skip + limit beyond max offset", () => {
      expect(() => resolveSkipAndLimit({ skip: 49500, limit: 1000 })).toThrow(ValidationError);
    });
  });

  describe("buildPaginationMetadata", () => {
    it("includes nextSkip when more results exist", () => {
      const meta = buildPaginationMetadata(0, 100, 5000);
      expect(meta.nextSkip).toBe(100);
      expect(meta.estimatedRequestsToFetchAll).toBe(50);
      expect(meta.maxPagesRemaining).toBeGreaterThan(0);
    });

    it("sets nextSkip null on last page", () => {
      const meta = buildPaginationMetadata(4900, 100, 5000);
      expect(meta.nextSkip).toBeNull();
    });
  });

  describe("validateBatchPagination", () => {
    it("allows small batch without confirmation", () => {
      expect(() =>
        validateBatchPagination({ startPage: 0, maxPages: 3, pageSize: 1000 }),
      ).not.toThrow();
    });

    it("requires confirmLargeFetch for many pages", () => {
      expect(() =>
        validateBatchPagination({
          startPage: 0,
          maxPages: CONFIRM_LARGE_FETCH_PAGES + 1,
          pageSize: 1000,
        }),
      ).toThrow(ValidationError);
    });

    it("allows large batch with confirmation", () => {
      expect(() =>
        validateBatchPagination({
          startPage: 0,
          maxPages: 10,
          pageSize: 1000,
          confirmLargeFetch: true,
        }),
      ).not.toThrow();
    });
  });

  describe("validatePaginationBounds", () => {
    it("accepts boundary skip", () => {
      expect(() => validatePaginationBounds(49000, 1000)).not.toThrow();
    });
  });
});
