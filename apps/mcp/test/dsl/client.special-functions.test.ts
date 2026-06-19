/**
 * Tests for DimensionsClient special function methods.
 * Covers: classify, extractConcepts, extractAffiliations, extractGrants
 * @module test/client.special-functions
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DimensionsClient } from "../../src/dsl/client.js";

describe("DimensionsClient special functions", () => {
  const originalFetch = globalThis.fetch;
  let client: DimensionsClient;

  beforeEach(() => {
    client = new DimensionsClient({
      apiKey: "test-api-key",
      rateLimitPerMinute: 100,
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe("classify()", () => {
    it("classifies text using FOR system", async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ token: "eyJhbGc.eyJzdWI.dGVzdA" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              FOR: [
                { id: "1117", name: "Public Health and Health Services" },
                { id: "1103", name: "Clinical Sciences" },
              ],
            }),
        });
      globalThis.fetch = mockFetch;

      const result = await client.classify({
        title: "Burnout and intentions to quit the nursing profession",
        abstract: "BACKGROUND: Burnout is an occupational disease...",
        system: "FOR",
      });

      expect(result.FOR).toBeDefined();
      expect(result.FOR).toHaveLength(2);
      expect(result.FOR[0].id).toBe("1117");
      expect(result.FOR[0].name).toBe("Public Health and Health Services");
    });

    it("classifies text using SDG system", async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ token: "eyJhbGc.eyJzdWI.dGVzdA" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              SDG: [{ id: "3", name: "Good Health and Well-being" }],
            }),
        });
      globalThis.fetch = mockFetch;

      const result = await client.classify({
        title: "Healthcare accessibility in rural areas",
        system: "SDG",
      });

      expect(result.SDG).toBeDefined();
      expect(result.SDG[0].id).toBe("3");
    });

    it("classifies text using RCDC system", async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ token: "eyJhbGc.eyJzdWI.dGVzdA" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              RCDC: [{ id: "cancer", name: "Cancer" }],
            }),
        });
      globalThis.fetch = mockFetch;

      const result = await client.classify({
        title: "Novel approaches to cancer treatment",
        abstract: "This study investigates...",
        system: "RCDC",
      });

      expect(result.RCDC).toBeDefined();
      expect(result.RCDC[0].name).toBe("Cancer");
    });

    it("handles title-only classification", async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ token: "eyJhbGc.eyJzdWI.dGVzdA" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              FOR: [{ id: "0801", name: "Artificial Intelligence" }],
            }),
        });
      globalThis.fetch = mockFetch;

      const result = await client.classify({
        title: "Machine Learning for Natural Language Processing",
        system: "FOR",
      });

      expect(result.FOR).toBeDefined();
    });
  });

  describe("extractConcepts()", () => {
    it("extracts concepts without scores (default)", async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ token: "eyJhbGc.eyJzdWI.dGVzdA" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              extracted_concepts: ["machine learning", "drug discovery", "precision medicine"],
            }),
        });
      globalThis.fetch = mockFetch;

      const result = await client.extractConcepts(
        "Machine learning algorithms for drug discovery and precision medicine",
      );

      expect(result.extracted_concepts).toEqual([
        "machine learning",
        "drug discovery",
        "precision medicine",
      ]);
    });

    it("extracts concepts with scores when requested", async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ token: "eyJhbGc.eyJzdWI.dGVzdA" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              extracted_concepts: [
                { concept: "machine learning", relevance: 0.95 },
                { concept: "drug discovery", relevance: 0.88 },
              ],
            }),
        });
      globalThis.fetch = mockFetch;

      const result = await client.extractConcepts(
        "Machine learning algorithms for drug discovery",
        { returnScores: true },
      );

      expect(result.extracted_concepts).toHaveLength(2);
      expect(result.extracted_concepts[0]).toEqual({
        concept: "machine learning",
        relevance: 0.95,
      });
    });

    it("throws ValidationError for empty text", async () => {
      await expect(client.extractConcepts("")).rejects.toThrow("Text must not be empty");
    });
  });

  describe("extractAffiliations()", () => {
    it("extracts affiliations from freetext", async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ token: "eyJhbGc.eyJzdWI.dGVzdA" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              extracted_affiliations: [
                {
                  id: "grid.4991.5",
                  name: "University of Oxford",
                  score: 0.95,
                },
              ],
            }),
        });
      globalThis.fetch = mockFetch;

      const result = await client.extractAffiliations([
        { affiliation: "University of Oxford, UK" },
      ]);

      expect(result.extracted_affiliations).toHaveLength(1);
      expect(result.extracted_affiliations[0].name).toBe("University of Oxford");
      expect(result.extracted_affiliations[0].score).toBe(0.95);
    });

    it("extracts affiliations from structured input", async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ token: "eyJhbGc.eyJzdWI.dGVzdA" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              extracted_affiliations: [
                {
                  id: "grid.168010.e",
                  name: "Stanford University",
                  score: 0.92,
                },
              ],
            }),
        });
      globalThis.fetch = mockFetch;

      const result = await client.extractAffiliations([
        { name: "Stanford", city: "Stanford", country: "USA" },
      ]);

      expect(result.extracted_affiliations[0].name).toBe("Stanford University");
    });

    it("handles multiple affiliations", async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ token: "eyJhbGc.eyJzdWI.dGVzdA" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              extracted_affiliations: [
                { id: "grid.4991.5", name: "University of Oxford", score: 0.95 },
                { id: "grid.168010.e", name: "Stanford University", score: 0.92 },
              ],
            }),
        });
      globalThis.fetch = mockFetch;

      const result = await client.extractAffiliations([
        { affiliation: "University of Oxford, UK" },
        { name: "Stanford", city: "Stanford", country: "USA" },
      ]);

      expect(result.extracted_affiliations).toHaveLength(2);
    });
  });

  describe("extractGrants()", () => {
    it("resolves a grant by grant number", async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ token: "eyJhbGc.eyJzdWI.dGVzdA" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ grant_id: "grant.2544064" }),
        });
      globalThis.fetch = mockFetch;

      const result = await client.extractGrants({
        grantNumber: "R01HL117329",
      });

      expect(result.grant_id).toBe("grant.2544064");
    });

    it("resolves a grant with fundref", async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ token: "eyJhbGc.eyJzdWI.dGVzdA" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ grant_id: "grant.2354998" }),
        });
      globalThis.fetch = mockFetch;

      const result = await client.extractGrants({
        grantNumber: "R01HL117329",
        fundref: "100000050",
      });

      expect(result.grant_id).toBe("grant.2354998");
    });

    it("handles no matching grant", async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ token: "eyJhbGc.eyJzdWI.dGVzdA" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ grant_id: null }),
        });
      globalThis.fetch = mockFetch;

      const result = await client.extractGrants({
        grantNumber: "NONEXISTENT123",
      });

      expect(result.grant_id).toBeNull();
    });
  });

  describe("organizations() fluent API", () => {
    it("returns FluentQueryBuilder for organizations", () => {
      const builder = client.organizations();
      const dsl = builder.for("MIT").getDsl();

      expect(dsl).toBe('search organizations for "MIT"');
    });

    it("supports complex organization queries", async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ token: "eyJhbGc.eyJzdWI.dGVzdA" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              organizations: [
                { id: "grid.116068.8", name: "Massachusetts Institute of Technology" },
              ],
              _stats: { total_count: 1 },
            }),
        });
      globalThis.fetch = mockFetch;

      const result = await client
        .organizations()
        .for("MIT")
        .where("country_name", "=", "United States")
        .execute();

      expect(result.data).toHaveLength(1);
      expect(result.data[0].name).toBe("Massachusetts Institute of Technology");
    });
  });
});
