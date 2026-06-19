/**
 * File export formatting for batch search results (JSONL and CSV).
 * @module mcp/export-format
 */

/** Supported on-disk export formats for fetch_search_pages file mode. */
export type ExportFormat = "jsonl" | "csv";

/**
 * Resolves export format from an explicit choice or output path extension.
 * @param outputPath - Destination file path
 * @param explicit - Optional format override
 * @returns Resolved format (defaults to JSONL)
 */
export function resolveExportFormat(outputPath: string, explicit?: ExportFormat): ExportFormat {
  if (explicit) return explicit;
  return outputPath.toLowerCase().endsWith(".csv") ? "csv" : "jsonl";
}

/**
 * Escapes a single CSV cell value.
 * @param value - Cell value
 * @returns CSV-safe string
 */
export function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text =
    typeof value === "string"
      ? value
      : typeof value === "number" || typeof value === "boolean"
        ? String(value)
        : JSON.stringify(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/**
 * Derives stable CSV column order from rows and optional preferred field list.
 * @param rows - Result rows
 * @param preferredFields - Field order from the search `fields` argument
 * @param existing - Columns from a resumed export
 * @returns Ordered column names
 */
export function deriveCsvColumns(
  rows: Record<string, unknown>[],
  preferredFields?: readonly string[],
  existing?: readonly string[],
): string[] {
  if (existing?.length) return [...existing];

  const keySet = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      keySet.add(key);
    }
  }

  const columns: string[] = [];
  if (preferredFields?.length) {
    for (const field of preferredFields) {
      if (keySet.has(field)) {
        columns.push(field);
        keySet.delete(field);
      }
    }
  }
  columns.push(...[...keySet].sort());
  return columns;
}

/**
 * Formats result rows for file export.
 * @param rows - Records to write
 * @param format - Target format
 * @param options - CSV column and header options
 * @returns Serialized text and resolved CSV columns
 */
export function formatRowsForExport(
  rows: Record<string, unknown>[],
  format: ExportFormat,
  options: {
    columns?: readonly string[];
    preferredFields?: readonly string[];
    includeHeader?: boolean;
  } = {},
): { text: string; columns: string[] } {
  if (rows.length === 0) {
    return { text: "", columns: options.columns ? [...options.columns] : [] };
  }

  if (format === "jsonl") {
    return {
      text: `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`,
      columns: [],
    };
  }

  const columns = deriveCsvColumns(rows, options.preferredFields, options.columns);
  const lines: string[] = [];
  if (options.includeHeader) {
    lines.push(columns.map(escapeCsvCell).join(","));
  }
  for (const row of rows) {
    lines.push(columns.map((column) => escapeCsvCell(row[column])).join(","));
  }

  return {
    text: `${lines.join("\n")}\n`,
    columns,
  };
}
