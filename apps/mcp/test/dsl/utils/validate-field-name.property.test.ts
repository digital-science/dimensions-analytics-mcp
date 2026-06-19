import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { ValidationError } from "../../../src/client/index.js";
import { validateFieldName } from "../../../src/dsl/utils/validate-field-name.js";

/** Must match the regex in validate-field-name.ts */
const FIELD_NAME_RE = /^[a-z_][a-z0-9_.]*$/i;

/** Characters that must never appear in a valid field name. */
const DANGEROUS_CHARS = new Set([
  '"',
  "'",
  " ",
  "\n",
  "\t",
  "\r",
  "(",
  ")",
  "{",
  "}",
  "[",
  "]",
  "<",
  ">",
  "|",
  "&",
  ";",
  "\\",
  "/",
  "`",
  "!",
  "@",
  "#",
  "%",
  "^",
  "~",
]);

/** Arbitrary that generates strings matching the field name regex. */
const validFieldName = fc
  .tuple(
    fc.constantFrom(..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_".split("")),
    fc
      .array(
        fc.constantFrom(
          ..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_.".split(""),
        ),
        { maxLength: 30 },
      )
      .map((arr) => arr.join("")),
  )
  .map(([first, rest]) => first + rest);

describe("validateFieldName property tests", () => {
  describe("F1: strings matching the regex are accepted", () => {
    it("accepts all valid field names", () => {
      fc.assert(
        fc.property(validFieldName, (s) => {
          expect(() => validateFieldName(s)).not.toThrow();
        }),
        { numRuns: 100 },
      );
    });
  });

  describe("F2: strings not matching the regex throw ValidationError", () => {
    it("rejects all invalid field names", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }).filter((s) => !FIELD_NAME_RE.test(s)),
          (s) => {
            expect(() => validateFieldName(s)).toThrow(ValidationError);
          },
        ),
        { numRuns: 200 },
      );
    });

    it("rejects empty strings", () => {
      expect(() => validateFieldName("")).toThrow(ValidationError);
    });
  });

  describe("F3: accepted field names contain no dangerous characters", () => {
    it("valid names have no injection-relevant characters", () => {
      fc.assert(
        fc.property(validFieldName, (s) => {
          // Should not throw
          validateFieldName(s);
          // Should contain no dangerous chars
          for (const ch of s) {
            expect(DANGEROUS_CHARS.has(ch)).toBe(false);
          }
        }),
        { numRuns: 100 },
      );
    });
  });
});
