/**
 * Assertion factory functions for MCP eval cases.
 *
 * Each function returns an {@link Assertion} object with a label and a check
 * function. The check receives the parsed JSON output from a tool call.
 * @module test/integration/assertions
 */

import type { Assertion } from "./types.js";

/**
 * Resolves a dot-separated path on an unknown value.
 * @param data - Root object
 * @param path - Dot-separated path (e.g., "publications.0.title")
 * @returns The resolved value, or `undefined` if the path does not exist
 */
function resolvePath(data: unknown, path: string): unknown {
  let current: unknown = data;
  for (const segment of path.split(".")) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

/**
 * Asserts the result is not an error (no `isError` flag, no `error` field at top level).
 * @returns Assertion
 */
export function isSuccess(): Assertion {
  return {
    label: "result is not an error",
    check(data) {
      const obj = data as Record<string, unknown>;
      if (obj.error) return `Got error: ${String(obj.error)}`;
      return true;
    },
  };
}

/**
 * Asserts a field at the given path exists (is not undefined).
 * @param path - Dot-separated path
 * @returns Assertion
 */
export function hasField(path: string): Assertion {
  return {
    label: `has field "${path}"`,
    check(data) {
      const value = resolvePath(data, path);
      if (value === undefined) return `Field "${path}" is missing`;
      return true;
    },
  };
}

/**
 * Asserts a field at the given path equals the expected value.
 * @param path - Dot-separated path
 * @param expected - Expected value (compared with ===)
 * @returns Assertion
 */
export function fieldEquals(path: string, expected: unknown): Assertion {
  return {
    label: `"${path}" === ${JSON.stringify(expected)}`,
    check(data) {
      const value = resolvePath(data, path);
      if (value !== expected) {
        return `Expected "${path}" to be ${JSON.stringify(expected)}, got ${JSON.stringify(value)}`;
      }
      return true;
    },
  };
}

/**
 * Asserts a string field at the given path contains a substring (case-insensitive).
 * @param path - Dot-separated path
 * @param substring - Expected substring
 * @returns Assertion
 */
export function fieldContains(path: string, substring: string): Assertion {
  return {
    label: `"${path}" contains "${substring}"`,
    check(data) {
      const value = resolvePath(data, path);
      if (typeof value !== "string") {
        return `Expected "${path}" to be a string, got ${typeof value}`;
      }
      if (!value.toLowerCase().includes(substring.toLowerCase())) {
        return `"${path}" does not contain "${substring}" (got "${value.slice(0, 200)}")`;
      }
      return true;
    },
  };
}

/**
 * Asserts a string field at the given path matches a regex.
 * @param path - Dot-separated path
 * @param pattern - Regular expression
 * @returns Assertion
 */
export function fieldMatches(path: string, pattern: RegExp): Assertion {
  return {
    label: `"${path}" matches ${pattern}`,
    check(data) {
      const value = resolvePath(data, path);
      if (typeof value !== "string") {
        return `Expected "${path}" to be a string, got ${typeof value}`;
      }
      if (!pattern.test(value)) {
        return `"${path}" does not match ${pattern} (got "${value.slice(0, 200)}")`;
      }
      return true;
    },
  };
}

/**
 * Asserts the value at the given path is an array with at least `min` items.
 * @param path - Dot-separated path
 * @param min - Minimum array length
 * @returns Assertion
 */
export function arrayMinLength(path: string, min: number): Assertion {
  return {
    label: `"${path}" has at least ${min} items`,
    check(data) {
      const value = resolvePath(data, path);
      if (!Array.isArray(value)) {
        return `Expected "${path}" to be an array, got ${typeof value}`;
      }
      if (value.length < min) {
        return `"${path}" has ${value.length} items, expected at least ${min}`;
      }
      return true;
    },
  };
}

/**
 * Asserts a numeric field at the given path is greater than a threshold.
 * @param path - Dot-separated path
 * @param threshold - Minimum exclusive value
 * @returns Assertion
 */
export function fieldGreaterThan(path: string, threshold: number): Assertion {
  return {
    label: `"${path}" > ${threshold}`,
    check(data) {
      const value = resolvePath(data, path);
      if (typeof value !== "number") {
        return `Expected "${path}" to be a number, got ${typeof value}`;
      }
      if (value <= threshold) {
        return `"${path}" is ${value}, expected > ${threshold}`;
      }
      return true;
    },
  };
}

/**
 * Asserts a numeric field at the given path is at least a threshold.
 * @param path - Dot-separated path
 * @param threshold - Minimum inclusive value
 * @returns Assertion
 */
export function fieldAtLeast(path: string, threshold: number): Assertion {
  return {
    label: `"${path}" >= ${threshold}`,
    check(data) {
      const value = resolvePath(data, path);
      if (typeof value !== "number") {
        return `Expected "${path}" to be a number, got ${typeof value}`;
      }
      if (value < threshold) {
        return `"${path}" is ${value}, expected >= ${threshold}`;
      }
      return true;
    },
  };
}

/**
 * Asserts the value at the given path is one of the allowed values.
 * @param path - Dot-separated path
 * @param allowed - Set of allowed values
 * @returns Assertion
 */
export function fieldOneOf(path: string, allowed: readonly unknown[]): Assertion {
  return {
    label: `"${path}" is one of [${allowed.map((v) => JSON.stringify(v)).join(", ")}]`,
    check(data) {
      const value = resolvePath(data, path);
      if (!allowed.includes(value)) {
        return `"${path}" is ${JSON.stringify(value)}, expected one of [${allowed.map((v) => JSON.stringify(v)).join(", ")}]`;
      }
      return true;
    },
  };
}

/**
 * Asserts that every element of the array at `path` satisfies all given assertions.
 * @param path - Dot-separated path to an array
 * @param itemAssertions - Assertions to apply to each item
 * @returns Assertion
 */
export function everyItem(path: string, itemAssertions: readonly Assertion[]): Assertion {
  return {
    label: `every item in "${path}" passes ${itemAssertions.length} assertions`,
    check(data) {
      const value = resolvePath(data, path);
      if (!Array.isArray(value)) {
        return `Expected "${path}" to be an array, got ${typeof value}`;
      }
      for (let i = 0; i < value.length; i++) {
        for (const assertion of itemAssertions) {
          const result = assertion.check(value[i]);
          if (result !== true) {
            return `Item [${i}] failed "${assertion.label}": ${result}`;
          }
        }
      }
      return true;
    },
  };
}

/**
 * Asserts that at least one element of the array at `path` satisfies all given assertions.
 * @param path - Dot-separated path to an array
 * @param itemAssertions - Assertions to apply
 * @returns Assertion
 */
export function someItem(path: string, itemAssertions: readonly Assertion[]): Assertion {
  return {
    label: `some item in "${path}" passes all assertions`,
    check(data) {
      const value = resolvePath(data, path);
      if (!Array.isArray(value)) {
        return `Expected "${path}" to be an array, got ${typeof value}`;
      }
      for (const item of value) {
        const allPass = itemAssertions.every((a) => a.check(item) === true);
        if (allPass) return true;
      }
      return `No item in "${path}" (${value.length} items) satisfied all assertions`;
    },
  };
}

/**
 * Custom assertion with a user-provided check function.
 * @param label - Human-readable label
 * @param check - Check function
 * @returns Assertion
 */
export function custom(label: string, check: (data: unknown) => true | string): Assertion {
  return { label, check };
}
