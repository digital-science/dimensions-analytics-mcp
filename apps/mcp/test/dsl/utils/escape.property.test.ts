import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { escapeDslString } from "../../../src/dsl/utils/escape.js";
import { unescapeString } from "../../../src/dsl/utils/string-utils.js";

/**
 * Checks whether a string contains an unescaped double quote.
 * Walks character-by-character, tracking backslash escaping.
 */
function containsUnescapedQuote(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "\\") {
      i++; // skip next char (it's escaped)
      continue;
    }
    if (s[i] === '"') return true;
  }
  return false;
}

/** Arbitrary that generates strings with full Unicode codepoints (including astral plane). */
const unicodeString = fc
  .array(
    fc
      .integer({ min: 0, max: 0x10ffff })
      .filter((n) => n < 0xd800 || n > 0xdfff)
      .map((n) => String.fromCodePoint(n)),
    { maxLength: 100 },
  )
  .map((arr) => arr.join(""));

/** Arbitrary that generates strings dense with characters escapeDslString handles. */
const adversarial = fc
  .array(
    fc.constantFrom('"', "\\", "\n", "\t", "\r", "\b", "\f", "\u201c", "\u201d", "a", " ", "\0"),
    { maxLength: 200 },
  )
  .map((arr) => arr.join(""));

describe("escapeDslString property tests", () => {
  describe("P1: no unescaped double quote in output", () => {
    it("holds for arbitrary ASCII strings", () => {
      fc.assert(
        fc.property(fc.string(), (s) => {
          expect(containsUnescapedQuote(escapeDslString(s))).toBe(false);
        }),
        { numRuns: 200 },
      );
    });

    it("holds for full unicode strings", () => {
      fc.assert(
        fc.property(unicodeString, (s) => {
          expect(containsUnescapedQuote(escapeDslString(s))).toBe(false);
        }),
        { numRuns: 200 },
      );
    });

    it("holds for adversarial strings", () => {
      fc.assert(
        fc.property(adversarial, (s) => {
          expect(containsUnescapedQuote(escapeDslString(s))).toBe(false);
        }),
        { numRuns: 50 },
      );
    });
  });

  describe("P2: roundtrip with unescapeString", () => {
    it("holds for arbitrary ASCII strings", () => {
      fc.assert(
        fc.property(fc.string(), (s) => {
          expect(unescapeString(escapeDslString(s))).toBe(s);
        }),
        { numRuns: 200 },
      );
    });

    it("holds for full unicode strings", () => {
      fc.assert(
        fc.property(unicodeString, (s) => {
          expect(unescapeString(escapeDslString(s))).toBe(s);
        }),
        { numRuns: 200 },
      );
    });

    it("holds for adversarial strings", () => {
      fc.assert(
        fc.property(adversarial, (s) => {
          expect(unescapeString(escapeDslString(s))).toBe(s);
        }),
        { numRuns: 50 },
      );
    });
  });

  describe("P3: output length >= input length", () => {
    it("escaping never shrinks the string", () => {
      fc.assert(
        fc.property(fc.string(), (s) => {
          expect(escapeDslString(s).length).toBeGreaterThanOrEqual(s.length);
        }),
        { numRuns: 200 },
      );
    });
  });
});
