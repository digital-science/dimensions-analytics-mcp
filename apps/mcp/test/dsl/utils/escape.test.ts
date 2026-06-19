import { describe, expect, it } from "vitest";
import { escapeDslString } from "../../../src/dsl/utils/escape.js";

describe("escapeDslString", () => {
  it("escapes double quotes", () => {
    expect(escapeDslString('hello "world"')).toBe('hello \\"world\\"');
  });

  it("escapes backslashes", () => {
    expect(escapeDslString("path\\to\\file")).toBe("path\\\\to\\\\file");
  });

  it("escapes newlines", () => {
    expect(escapeDslString("line one\nline two")).toBe("line one\\nline two");
  });

  it("handles combined special characters", () => {
    expect(escapeDslString('say "hello"\nnew\\line')).toBe('say \\"hello\\"\\nnew\\\\line');
  });

  it("returns empty string unchanged", () => {
    expect(escapeDslString("")).toBe("");
  });

  it("returns string with no special characters unchanged", () => {
    expect(escapeDslString("plain text")).toBe("plain text");
  });

  it("escapes injection payload", () => {
    const payload = 'test" return publications limit 9999 //';
    expect(escapeDslString(payload)).toBe('test\\" return publications limit 9999 //');
  });

  it("escapes backslash before quote (double escape)", () => {
    expect(escapeDslString('a\\"b')).toBe('a\\\\\\"b');
  });

  it("escapes left smart quote (U+201C)", () => {
    expect(escapeDslString("say \u201chello\u201d")).toBe("say \\\u201chello\\\u201d");
  });

  it("escapes right smart quote (U+201D)", () => {
    expect(escapeDslString("\u201dend")).toBe("\\\u201dend");
  });

  it("escapes tab character", () => {
    expect(escapeDslString("col1\tcol2")).toBe("col1\\tcol2");
  });

  it("escapes carriage return", () => {
    expect(escapeDslString("line\r\nbreak")).toBe("line\\r\\nbreak");
  });

  it("escapes backspace and form feed", () => {
    expect(escapeDslString("a\bb\fc")).toBe("a\\bb\\fc");
  });

  it("escapes smart quote injection payload", () => {
    const payload = "test\u201d return publications limit 9999 //";
    expect(escapeDslString(payload)).toBe(
      "\\\u201d return publications limit 9999 //".replace(/^/, "test"),
    );
  });

  // --- Null byte ---
  it("escapes embedded null byte", () => {
    expect(escapeDslString("before\0after")).toBe("before\\u0000after");
  });

  it("escapes standalone null byte", () => {
    expect(escapeDslString("\0")).toBe("\\u0000");
  });

  // --- C0 controls ---
  it("escapes SOH (U+0001)", () => {
    expect(escapeDslString("\u0001")).toBe("\\u0001");
  });

  it("escapes US (U+001F)", () => {
    expect(escapeDslString("\u001f")).toBe("\\u001f");
  });

  it("preserves named escapes for C0 characters", () => {
    expect(escapeDslString("\n")).toBe("\\n");
    expect(escapeDslString("\t")).toBe("\\t");
    expect(escapeDslString("\r")).toBe("\\r");
    expect(escapeDslString("\b")).toBe("\\b");
    expect(escapeDslString("\f")).toBe("\\f");
  });

  // --- DEL + C1 controls ---
  it("escapes DEL (U+007F)", () => {
    expect(escapeDslString("\u007f")).toBe("\\u007f");
  });

  it("escapes U+0080 (C1 start)", () => {
    expect(escapeDslString("\u0080")).toBe("\\u0080");
  });

  it("escapes U+009F (C1 end)", () => {
    expect(escapeDslString("\u009f")).toBe("\\u009f");
  });

  it("does NOT escape U+00A0 (NBSP, just outside C1)", () => {
    expect(escapeDslString("\u00a0")).toBe("\u00a0");
  });

  // --- Line/paragraph separators ---
  it("escapes line separator (U+2028)", () => {
    expect(escapeDslString("a\u2028b")).toBe("a\\u2028b");
  });

  it("escapes paragraph separator (U+2029)", () => {
    expect(escapeDslString("a\u2029b")).toBe("a\\u2029b");
  });

  // --- Smart single quotes ---
  it("escapes left single smart quote (U+2018)", () => {
    expect(escapeDslString("\u2018hello\u2019")).toBe("\\u2018hello\\u2019");
  });

  it("escapes right single smart quote (U+2019)", () => {
    expect(escapeDslString("\u2019")).toBe("\\u2019");
  });

  // --- Boundary guards ---
  it("does NOT escape É (U+00C9)", () => {
    expect(escapeDslString("\u00c9")).toBe("\u00c9");
  });

  it("does NOT escape em dash (U+2014)", () => {
    expect(escapeDslString("\u2014")).toBe("\u2014");
  });

  // --- Security: compound payload ---
  it("escapes injection payload with null byte and line separator", () => {
    const payload = 'test\0"\u2028return publications limit 9999';
    expect(escapeDslString(payload)).toBe('test\\u0000\\"\\u2028return publications limit 9999');
  });
});
