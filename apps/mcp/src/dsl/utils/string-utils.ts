/**
 * String manipulation utilities for DSL quoting and escape sequences.
 * @module utils/string-utils
 */

/**
 * Strips the first and last character from a quoted string token.
 * @param text - The raw STRING token text including quotes
 * @returns The unquoted string content
 */
export function stripQuotes(text: string): string {
  return unescapeString(text.slice(1, -1));
}

/**
 * Strips triple quotes from a LONG_STRING token.
 * @param text - The raw LONG_STRING token text including triple quotes
 * @returns The unquoted string content
 */
export function stripTripleQuotes(text: string): string {
  return unescapeString(text.slice(3, -3));
}

/**
 * Processes escape sequences in a DSL string.
 * @param text - The string content (without outer quotes)
 * @returns The unescaped string
 */
export function unescapeString(text: string): string {
  if (!text.includes("\\")) return text;

  let result = "";
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\\" && i + 1 < text.length) {
      const next = text[i + 1];
      switch (next) {
        case '"':
        case "\u201c":
        case "\u201d":
        case "\\":
        case "/":
        case "^":
        case "*":
        case "?":
        case ":":
        case "~":
        case "[":
        case "]":
        case "{":
        case "}":
        case "(":
        case ")":
        case "!":
        case "|":
        case "&":
        case "+":
        case "-":
          result += next;
          i++;
          break;
        case "n":
          result += "\n";
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

/**
 * Escapes special characters in a string for DSL output.
 * @param text - The raw string content
 * @returns The escaped string (without surrounding quotes)
 */
export function escapeString(text: string): string {
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
      default:
        result += ch;
    }
  }
  return result;
}

/**
 * Wraps a string in double quotes after escaping special characters.
 * @param text - The raw string content
 * @returns The quoted and escaped string
 */
export function quoteString(text: string): string {
  return `"${escapeString(text)}"`;
}
