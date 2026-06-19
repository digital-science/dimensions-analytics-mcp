/**
 * Tests for Dimensions reasonable-use policy guardrails.
 * @module test/dsl/usage-policy
 */

import { describe, expect, it } from "vitest";
import { ValidationError } from "../../src/client/index.js";
import {
  buildExecuteDslPolicyHints,
  buildUsagePolicy,
  isFacetOnlyQuery,
  parseDslPagination,
  validateExecuteDslPolicy,
  validateSearchPaginationPolicy,
} from "../../src/dsl/usage-policy.js";

describe("usage policy", () => {
  describe("buildUsagePolicy", () => {
    it("includes limits and guardrail thresholds", () => {
      const policy = buildUsagePolicy();
      expect(policy.limits.maxPages).toBe(50);
      expect(policy.guardrails.largeResultWarningThreshold).toBe(10_000);
      expect(policy.recommendations.length).toBeGreaterThan(2);
    });
  });

  describe("parseDslPagination", () => {
    it("extracts limit and skip from DSL", () => {
      expect(
        parseDslPagination(
          'search publications for "x" return publications sort by year desc limit 100 skip 5000',
        ),
      ).toEqual({ limit: 100, skip: 5000 });
    });
  });

  describe("validateSearchPaginationPolicy", () => {
    it("allows shallow pagination without confirmation", () => {
      expect(() => validateSearchPaginationPolicy({ skip: 0, limit: 100 })).not.toThrow();
    });

    it("requires confirmLargeFetch for deep skip", () => {
      expect(() => validateSearchPaginationPolicy({ skip: 5000, limit: 100 })).toThrow(
        ValidationError,
      );
    });

    it("allows deep skip with confirmation", () => {
      expect(() =>
        validateSearchPaginationPolicy({
          skip: 5000,
          limit: 100,
          confirmLargeFetch: true,
        }),
      ).not.toThrow();
    });
  });

  describe("validateExecuteDslPolicy", () => {
    it("rejects skip on facet-only queries", () => {
      expect(() =>
        validateExecuteDslPolicy({
          dsl: 'search publications for "ml" return year limit 20 skip 100',
        }),
      ).toThrow(/Facet queries cannot be paginated/);
    });

    it("requires confirmLargeFetch for deep DSL pagination", () => {
      expect(() =>
        validateExecuteDslPolicy({
          dsl: 'search publications for "ml" return publications limit 100 skip 5000',
        }),
      ).toThrow(/confirmLargeFetch/);
    });
  });

  describe("isFacetOnlyQuery", () => {
    it("detects facet year returns", () => {
      expect(isFacetOnlyQuery("search publications return year limit 20")).toBe(true);
    });

    it("detects entity row returns", () => {
      expect(isFacetOnlyQuery('search publications for "x" return publications limit 20')).toBe(
        false,
      );
    });
  });

  describe("buildExecuteDslPolicyHints", () => {
    it("adds largeResultWarning and paginationHint for big totals", () => {
      const hints = buildExecuteDslPolicyHints(
        'search publications for "ml" return publications limit 10',
        { publications: [], _stats: { total_count: 25_000 } },
      );
      expect(hints.largeResultWarning).toContain("25,000");
      expect(hints.paginationHint).toContain("25");
      expect(hints.policyNotice).toBeDefined();
    });
  });
});
