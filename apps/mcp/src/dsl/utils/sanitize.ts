/**
 * Input sanitization for DSL query construction.
 * @module utils/sanitize
 */

/** Maximum allowed length for search text within a `for "..."` clause. */
export const MAX_SEARCH_TEXT_LENGTH = 10_000;

const ZERO_WIDTH_RE = /[\u00AD\u180E\u200B-\u200F\u2028\u2029\uFEFF\u2060-\u2064]/g;

/**
 * Normalizes user search text before embedding in DSL.
 * @param text - Raw input text
 * @returns Sanitized text
 */
export function sanitizeInput(text: string): string {
  return text
    .normalize("NFC")
    .replace(ZERO_WIDTH_RE, "")
    .replace(/[\u201c\u201d]/g, '"');
}
