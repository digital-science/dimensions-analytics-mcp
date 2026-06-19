/**
 * Tests for batch export formatting helpers.
 * @module test/mcp/export-format
 */

import { describe, expect, it } from "vitest";
import {
  deriveCsvColumns,
  escapeCsvCell,
  formatRowsForExport,
  resolveExportFormat,
} from "../../src/mcp/export-format.js";

describe("export-format", () => {
  describe("resolveExportFormat", () => {
    it("infers CSV from .csv extension", () => {
      expect(resolveExportFormat("/tmp/results.csv")).toBe("csv");
    });

    it("defaults to JSONL for other extensions", () => {
      expect(resolveExportFormat("/tmp/results.jsonl")).toBe("jsonl");
    });

    it("prefers explicit format", () => {
      expect(resolveExportFormat("/tmp/results.jsonl", "csv")).toBe("csv");
    });
  });

  describe("escapeCsvCell", () => {
    it("quotes values with commas", () => {
      expect(escapeCsvCell("a,b")).toBe('"a,b"');
    });

    it("JSON-stringifies nested values", () => {
      expect(escapeCsvCell({ id: "pub.1" })).toBe('"{""id"":""pub.1""}"');
    });
  });

  describe("formatRowsForExport", () => {
    it("writes CSV with header and preferred field order", () => {
      const { text } = formatRowsForExport(
        [
          { id: "pub.1", title: "Alpha", year: 2024 },
          { id: "pub.2", title: "Beta", journal: "Nature" },
        ],
        "csv",
        { preferredFields: ["title", "id"], includeHeader: true },
      );

      expect(text).toBe("title,id,journal,year\n" + "Alpha,pub.1,,2024\n" + "Beta,pub.2,Nature,\n");
    });

    it("writes JSONL lines", () => {
      const { text } = formatRowsForExport([{ id: "pub.1" }], "jsonl");
      expect(text).toBe('{"id":"pub.1"}\n');
    });
  });

  describe("deriveCsvColumns", () => {
    it("reuses existing columns on resume", () => {
      expect(deriveCsvColumns([{ id: "pub.2", extra: true }], ["title"], ["id", "title"])).toEqual([
        "id",
        "title",
      ]);
    });
  });
});
