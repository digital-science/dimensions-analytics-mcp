/**
 * Unit tests for the MCP output prompt-injection guardrails.
 * @module test/mcp/untrusted-output
 */
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  sanitizeToolOutput,
  stripInvisibleCharacters,
  UNTRUSTED_RESULT_NOTE,
  withUntrustedResultNote,
} from "../../src/mcp/untrusted-output.js";

/** Codepoints the sanitizer is required to remove, as [name, character] pairs. */
const STRIPPED: ReadonlyArray<readonly [string, string]> = [
  ["U+00AD soft hyphen", "\u00AD"],
  ["U+180E Mongolian vowel separator", "\u180E"],
  ["U+200B zero-width space", "\u200B"],
  ["U+200C zero-width non-joiner", "\u200C"],
  ["U+200D zero-width joiner", "\u200D"],
  ["U+200E left-to-right mark", "\u200E"],
  ["U+200F right-to-left mark", "\u200F"],
  ["U+202A left-to-right embedding", "\u202A"],
  ["U+202B right-to-left embedding", "\u202B"],
  ["U+202C pop directional formatting", "\u202C"],
  ["U+202D left-to-right override", "\u202D"],
  ["U+202E right-to-left override", "\u202E"],
  ["U+2060 word joiner", "\u2060"],
  ["U+2066 left-to-right isolate", "\u2066"],
  ["U+2067 right-to-left isolate", "\u2067"],
  ["U+2068 first strong isolate", "\u2068"],
  ["U+2069 pop directional isolate", "\u2069"],
  ["U+FEFF byte order mark", "\uFEFF"],
  ["U+E0000 tag block start", "\u{E0000}"],
  ["U+E0041 tag latin capital A", "\u{E0041}"],
  ["U+E007F cancel tag", "\u{E007F}"],
];

describe("stripInvisibleCharacters", () => {
  // --- Stripped codepoints ---
  for (const [name, char] of STRIPPED) {
    it(`strips ${name}`, () => {
      expect(stripInvisibleCharacters(`a${char}b`)).toBe("ab");
    });
  }

  it("strips a run of mixed invisible characters", () => {
    expect(stripInvisibleCharacters("Ig\u200Bno\u202Ere\u00AD this")).toBe("Ignore this");
  });

  // --- Preserved content ---
  it("preserves plain ASCII", () => {
    expect(stripInvisibleCharacters("CRISPR gene editing")).toBe("CRISPR gene editing");
  });

  it("preserves CJK text", () => {
    expect(stripInvisibleCharacters("\u4E2D\u6587")).toBe("\u4E2D\u6587");
  });

  it("preserves accented Latin text", () => {
    expect(stripInvisibleCharacters("caf\u00E9 na\u00EFve")).toBe("caf\u00E9 na\u00EFve");
  });

  it("preserves newlines and tabs", () => {
    expect(stripInvisibleCharacters("a\nb\tc")).toBe("a\nb\tc");
  });

  it("preserves U+2028 and U+2029 line separators", () => {
    expect(stripInvisibleCharacters("a\u2028b\u2029c")).toBe("a\u2028b\u2029c");
  });

  it("returns an empty string unchanged", () => {
    expect(stripInvisibleCharacters("")).toBe("");
  });

  it("is idempotent", () => {
    const once = stripInvisibleCharacters("a\u200Bb");
    expect(stripInvisibleCharacters(once)).toBe(once);
  });
});

describe("sanitizeToolOutput", () => {
  // --- Structural sharing ---
  it("returns the same reference when nothing changes", () => {
    const clean = { publications: [{ id: "pub.1", title: "Clean title" }], totalCount: 1 };
    expect(sanitizeToolOutput(clean)).toBe(clean);
  });

  it("returns a new object without mutating the original when something changes", () => {
    const poisoned = { title: "Hidden\u200Btext" };
    const result = sanitizeToolOutput(poisoned);
    expect(result).not.toBe(poisoned);
    expect(result.title).toBe("Hiddentext");
    expect(poisoned.title).toBe("Hidden\u200Btext");
  });

  it("shares clean sibling branches by reference", () => {
    const cleanBranch = { id: "pub.2", title: "Untouched" };
    const data = { a: { title: "bad\u202E" }, b: cleanBranch };
    const result = sanitizeToolOutput(data);
    expect(result).not.toBe(data);
    expect(result.b).toBe(cleanBranch);
  });

  // --- Traversal ---
  it("sanitizes strings nested in arrays and objects", () => {
    const data = {
      publications: [
        { id: "pub.1", authors: [{ name: "Ada\u200B Lovelace" }] },
        { id: "pub.2", abstract: "Normal abstract" },
      ],
    };
    const result = sanitizeToolOutput(data);
    expect(result.publications[0].authors[0].name).toBe("Ada Lovelace");
    expect(result.publications[1].abstract).toBe("Normal abstract");
  });

  it("sanitizes a bare string", () => {
    expect(sanitizeToolOutput("a\u200Bb")).toBe("ab");
  });

  it("sanitizes a top-level array", () => {
    expect(sanitizeToolOutput(["a\u200Bb", "c"])).toEqual(["ab", "c"]);
  });

  it("handles 500 levels of nesting without throwing", () => {
    let deep: Record<string, unknown> = { title: "deep\u200B" };
    for (let i = 0; i < 500; i += 1) deep = { child: deep };
    expect(() => sanitizeToolOutput(deep)).not.toThrow();
  });

  // --- Values passed through ---
  it("passes primitives and nullish values through", () => {
    expect(sanitizeToolOutput(null)).toBeNull();
    expect(sanitizeToolOutput(undefined)).toBeUndefined();
    expect(sanitizeToolOutput(42)).toBe(42);
    expect(sanitizeToolOutput(true)).toBe(true);
  });

  it("preserves undefined properties, matching JSON.stringify behaviour", () => {
    const data = { largeResultWarning: undefined, title: "bad\u200B" };
    const result = sanitizeToolOutput(data);
    expect("largeResultWarning" in result).toBe(true);
    expect(JSON.stringify(result)).toBe('{"title":"bad"}');
  });

  it("returns non-plain objects untouched so JSON.stringify can serialize them", () => {
    const date = new Date("2026-01-01T00:00:00.000Z");
    const result = sanitizeToolOutput({ retrievedAt: date });
    expect(result.retrievedAt).toBe(date);
    expect(JSON.stringify(result)).toContain("2026-01-01T00:00:00.000Z");
  });

  // --- Keys ---
  it("sanitizes values but leaves object keys alone", () => {
    const result = sanitizeToolOutput({ "a\u200Bb": "x\u200By" });
    expect(Object.keys(result)).toEqual(["a\u200Bb"]);
    expect(result["a\u200Bb"]).toBe("xy");
  });
});

describe("withUntrustedResultNote", () => {
  it("appends the shared note", () => {
    const result = withUntrustedResultNote("Search publications.");
    expect(result.startsWith("Search publications.")).toBe(true);
    expect(result).toContain(UNTRUSTED_RESULT_NOTE);
  });

  it("is idempotent", () => {
    const once = withUntrustedResultNote("Search publications.");
    expect(withUntrustedResultNote(once)).toBe(once);
  });

  it("appends the note exactly once", () => {
    const result = withUntrustedResultNote("Search publications.");
    expect(result.split(UNTRUSTED_RESULT_NOTE)).toHaveLength(2);
  });
});

describe("untrusted output property tests", () => {
  const strippedChars = STRIPPED.map(([, char]) => char);

  /** Arbitrary over any single non-surrogate codepoint. */
  const anyCodepoint = fc
    .integer({ min: 0, max: 0x10ffff })
    .filter((n) => n < 0xd800 || n > 0xdfff)
    .map((n) => String.fromCodePoint(n));

  /**
   * Arbitrary over text that interleaves ordinary characters with the invisible ones.
   * Plain `fc.string()` never generates them, which would make these properties vacuous.
   */
  const poisonedString = fc
    .array(
      fc.oneof(
        { weight: 1, arbitrary: fc.constantFrom(...strippedChars) },
        { weight: 3, arbitrary: anyCodepoint },
      ),
      { maxLength: 100 },
    )
    .map((parts) => parts.join(""));

  /** Arbitrary over a JSON payload whose string leaves may carry invisible characters. */
  const poisonedPayload = fc.letrec<{ node: unknown }>((tie) => ({
    node: fc.oneof(
      { depthSize: "small", withCrossShrink: true },
      poisonedString,
      fc.integer(),
      fc.boolean(),
      fc.constant(null),
      fc.array(tie("node"), { maxLength: 5 }),
      fc.dictionary(fc.string({ maxLength: 8 }), tie("node"), { maxKeys: 5 }),
    ),
  })).node;

  it("never leaves a stripped codepoint in the output", () => {
    fc.assert(
      fc.property(poisonedString, (text) => {
        const cleaned = stripInvisibleCharacters(text);
        return strippedChars.every((char) => !cleaned.includes(char));
      }),
    );
  });

  it("is idempotent for arbitrary strings", () => {
    fc.assert(
      fc.property(poisonedString, (text) => {
        const once = stripInvisibleCharacters(text);
        return stripInvisibleCharacters(once) === once;
      }),
    );
  });

  it("leaves no stripped codepoint in a serialized JSON payload", () => {
    fc.assert(
      fc.property(poisonedPayload, (value) => {
        const serialized = JSON.stringify(sanitizeToolOutput(value)) ?? "";
        return strippedChars.every((char) => !serialized.includes(char));
      }),
    );
  });

  it("sanitizing a payload twice equals sanitizing it once", () => {
    fc.assert(
      fc.property(poisonedPayload, (value) => {
        const once = sanitizeToolOutput(value);
        return JSON.stringify(sanitizeToolOutput(once)) === JSON.stringify(once);
      }),
    );
  });
});
