/**
 * Escapes a string for safe inclusion in a DSL query.
 *
 * Handles backslashes, double quotes (including Unicode smart quotes),
 * and control characters to prevent DSL injection attacks when
 * user-supplied strings are interpolated into queries.
 *
 * Characters escaped via `\uXXXX` (ANTLR grammar-compatible):
 * - Null byte and C0 controls (U+0000–U+001F) not covered by named escapes
 * - DEL and C1 controls (U+007F–U+009F)
 * - Smart single quotes (U+2018, U+2019)
 * - Line and paragraph separators (U+2028, U+2029)
 *
 * @param text - The string to escape
 * @returns The escaped string safe for DSL interpolation
 */
export function escapeDslString(text: string): string {
  let result = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    switch (ch) {
      case "\\":
        result += "\\\\";
        break;
      case '"':
        result += '\\"';
        break;
      case "\u201c":
        result += "\\\u201c";
        break;
      case "\u201d":
        result += "\\\u201d";
        break;
      case "\n":
        result += "\\n";
        break;
      case "\t":
        result += "\\t";
        break;
      case "\r":
        result += "\\r";
        break;
      case "\b":
        result += "\\b";
        break;
      case "\f":
        result += "\\f";
        break;
      default: {
        const code = ch.charCodeAt(0);
        if (
          code <= 0x001f ||
          (code >= 0x007f && code <= 0x009f) ||
          code === 0x2018 ||
          code === 0x2019 ||
          code === 0x2028 ||
          code === 0x2029
        ) {
          result += `\\u${code.toString(16).padStart(4, "0")}`;
        } else {
          result += ch;
        }
      }
    }
  }
  return result;
}

/**
 * Unescapes DSL string literal content (inverse of {@link escapeDslString} for common sequences).
 * @param text - Escaped string content without surrounding quotes
 * @returns Unescaped string
 */
export function unescapeDslString(text: string): string {
  if (!text.includes("\\")) return text;

  let result = "";
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\\" && i + 1 < text.length) {
      const next = text[i + 1];
      switch (next) {
        case '"':
        case "\\":
        case "n":
          result += next === "n" ? "\n" : next;
          i++;
          break;
        case "t":
          result += "\t";
          i++;
          break;
        case "r":
          result += "\r";
          i++;
          break;
        case "b":
          result += "\b";
          i++;
          break;
        case "f":
          result += "\f";
          i++;
          break;
        case "u": {
          const hex = text.slice(i + 2, i + 6);
          if (hex.length === 4 && /^[0-9a-fA-F]{4}$/.test(hex)) {
            result += String.fromCharCode(Number.parseInt(hex, 16));
            i += 5;
          } else {
            result += "\\";
          }
          break;
        }
        default:
          result += "\\";
          break;
      }
    } else {
      result += text[i];
    }
  }
  return result;
}
