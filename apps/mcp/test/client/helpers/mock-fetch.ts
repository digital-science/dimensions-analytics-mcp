/**
 * Test helpers for mocking globalThis.fetch.
 * @module test/helpers/mock-fetch
 */

import type { Mock } from "vitest";
import { vi } from "vitest";

/**
 * Mocks globalThis.fetch to return a successful JSON response.
 * @param json - The JSON body to return
 * @param opts - Optional response overrides
 * @param opts.ok - Whether the response is ok (default: true)
 * @param opts.status - HTTP status code (default: 200)
 * @returns The mock function installed as globalThis.fetch
 */
export function mockFetchJson(json: unknown, opts?: { ok?: boolean; status?: number }): Mock {
  const mock = vi.fn().mockResolvedValue({
    ok: opts?.ok ?? true,
    status: opts?.status ?? 200,
    json: () => Promise.resolve(json),
  });
  globalThis.fetch = mock;
  return mock;
}

/**
 * Mocks globalThis.fetch to return an error HTTP response (no body).
 * @param opts - Response status options
 * @param opts.status - HTTP status code
 * @param opts.statusText - HTTP status text
 * @returns The mock function installed as globalThis.fetch
 */
export function mockFetchError(opts: { status: number; statusText: string }): Mock {
  const mock = vi.fn().mockResolvedValue({
    ok: false,
    status: opts.status,
    statusText: opts.statusText,
  });
  globalThis.fetch = mock;
  return mock;
}
