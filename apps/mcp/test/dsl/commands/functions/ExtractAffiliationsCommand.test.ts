/**
 * Tests for ExtractAffiliationsCommand.
 * @module test/commands/functions/ExtractAffiliationsCommand
 */

import { describe, expect, it } from "vitest";
import { ValidationError } from "../../../../src/client/index.js";
import {
  ExtractAffiliationsCommand,
  ExtractAffiliationsInputSchema,
} from "../../../../src/dsl/commands/functions/ExtractAffiliationsCommand.js";

describe("ExtractAffiliationsCommand", () => {
  describe("input validation", () => {
    it("should accept valid freetext affiliation input", () => {
      const input = {
        affiliations: [
          { affiliation: "University of Oxford, UK" },
          { affiliation: "Stanford University, Stanford, CA, USA" },
        ],
      };

      const cmd = new ExtractAffiliationsCommand(input);
      expect(cmd.input.affiliations).toHaveLength(2);
    });

    it("should accept valid structured affiliation input", () => {
      const input = {
        affiliations: [
          { name: "Stanford", city: "Stanford", country: "USA" },
          { name: "MIT", state: "Massachusetts", country: "USA" },
        ],
      };

      const cmd = new ExtractAffiliationsCommand(input);
      expect(cmd.input.affiliations).toHaveLength(2);
    });

    it("should accept mixed freetext and structured input", () => {
      const input = {
        affiliations: [
          { affiliation: "University of Oxford, UK" },
          { name: "Stanford", city: "Stanford", country: "USA" },
        ],
      };

      const cmd = new ExtractAffiliationsCommand(input);
      expect(cmd.input.affiliations).toHaveLength(2);
    });

    it("should reject empty affiliations array", () => {
      expect(() => {
        new ExtractAffiliationsCommand({ affiliations: [] });
      }).toThrow(ValidationError);
    });

    it("should reject affiliation with neither freetext nor structured fields", () => {
      expect(() => {
        new ExtractAffiliationsCommand({
          affiliations: [{}],
        });
      }).toThrow(ValidationError);
    });

    it("should accept affiliation with only name (minimal structured)", () => {
      const input = {
        affiliations: [{ name: "Harvard" }],
      };

      const cmd = new ExtractAffiliationsCommand(input);
      expect(cmd.input.affiliations).toHaveLength(1);
    });
  });

  describe("DSL generation", () => {
    it("should generate correct DSL for freetext affiliations", () => {
      const cmd = new ExtractAffiliationsCommand({
        affiliations: [{ affiliation: "University of Oxford, UK" }],
      });

      const dsl = cmd.resolveQuery();
      expect(dsl).toBe('extract_affiliations(json=[{"affiliation": "University of Oxford, UK"}])');
    });

    it("should generate correct DSL for structured affiliations", () => {
      const cmd = new ExtractAffiliationsCommand({
        affiliations: [{ name: "Stanford", city: "Stanford", country: "USA" }],
      });

      const dsl = cmd.resolveQuery();
      expect(dsl).toBe(
        'extract_affiliations(json=[{"name": "Stanford", "city": "Stanford", "country": "USA"}])',
      );
    });

    it("should generate correct DSL for multiple affiliations", () => {
      const cmd = new ExtractAffiliationsCommand({
        affiliations: [
          { affiliation: "University of Oxford, UK" },
          { name: "Stanford", city: "Stanford", country: "USA" },
        ],
      });

      const dsl = cmd.resolveQuery();
      expect(dsl).toBe(
        'extract_affiliations(json=[{"affiliation": "University of Oxford, UK"}, {"name": "Stanford", "city": "Stanford", "country": "USA"}])',
      );
    });

    it("should escape quotes in affiliation text", () => {
      const cmd = new ExtractAffiliationsCommand({
        affiliations: [{ affiliation: 'University "Test" Name' }],
      });

      const dsl = cmd.resolveQuery();
      expect(dsl).toContain('\\"Test\\"');
    });

    it("should include state when provided in structured input", () => {
      const cmd = new ExtractAffiliationsCommand({
        affiliations: [{ name: "MIT", state: "Massachusetts", country: "USA" }],
      });

      const dsl = cmd.resolveQuery();
      expect(dsl).toContain('"state": "Massachusetts"');
    });
  });

  describe("response transformation", () => {
    it("should transform valid API response", () => {
      const cmd = new ExtractAffiliationsCommand({
        affiliations: [{ affiliation: "University of Oxford" }],
      });

      const response = {
        extracted_affiliations: [
          {
            id: "grid.4991.5",
            name: "University of Oxford",
            country: "United Kingdom",
            score: 0.95,
          },
        ],
      };

      const result = cmd.transformResponse(response);
      expect(result.extracted_affiliations).toHaveLength(1);
      expect(result.extracted_affiliations[0].id).toBe("grid.4991.5");
      expect(result.extracted_affiliations[0].name).toBe("University of Oxford");
      expect(result.extracted_affiliations[0].score).toBe(0.95);
    });

    it("should handle multiple results per affiliation", () => {
      const cmd = new ExtractAffiliationsCommand({
        affiliations: [{ affiliation: "Stanford" }],
      });

      const response = {
        extracted_affiliations: [
          { id: "grid.168010.e", name: "Stanford University", score: 0.98 },
          { id: "grid.168011.e", name: "Stanford Health Care", score: 0.72 },
        ],
      };

      const result = cmd.transformResponse(response);
      expect(result.extracted_affiliations).toHaveLength(2);
    });

    it("should handle empty results", () => {
      const cmd = new ExtractAffiliationsCommand({
        affiliations: [{ affiliation: "Unknown Institution XYZ" }],
      });

      const response = {
        extracted_affiliations: [],
      };

      const result = cmd.transformResponse(response);
      expect(result.extracted_affiliations).toHaveLength(0);
    });

    it("should handle results without optional fields", () => {
      const cmd = new ExtractAffiliationsCommand({
        affiliations: [{ affiliation: "Some University" }],
      });

      const response = {
        extracted_affiliations: [{ id: "grid.123456", name: "Some University" }],
      };

      const result = cmd.transformResponse(response);
      expect(result.extracted_affiliations[0].country).toBeUndefined();
      expect(result.extracted_affiliations[0].score).toBeUndefined();
    });

    it("should throw ValidationError for invalid response structure", () => {
      const cmd = new ExtractAffiliationsCommand({
        affiliations: [{ affiliation: "Test" }],
      });

      expect(() => {
        cmd.transformResponse({ invalid: "response" });
      }).toThrow(ValidationError);
    });

    it("should throw ValidationError for missing id in result", () => {
      const cmd = new ExtractAffiliationsCommand({
        affiliations: [{ affiliation: "Test" }],
      });

      expect(() => {
        cmd.transformResponse({
          extracted_affiliations: [{ name: "Test University" }],
        });
      }).toThrow(ValidationError);
    });
  });

  describe("results parameter", () => {
    it("should generate DSL without results when not specified", () => {
      const cmd = new ExtractAffiliationsCommand({
        affiliations: [{ affiliation: "University of Oxford" }],
      });

      const dsl = cmd.resolveQuery();
      expect(dsl).not.toContain("results=");
    });

    it("should generate DSL with results='full'", () => {
      const cmd = new ExtractAffiliationsCommand({
        affiliations: [{ affiliation: "University of Oxford" }],
        results: "full",
      });

      const dsl = cmd.resolveQuery();
      expect(dsl).toContain('results="full"');
    });

    it("should generate DSL with results='basic'", () => {
      const cmd = new ExtractAffiliationsCommand({
        affiliations: [{ affiliation: "Test" }],
        results: "basic",
      });

      const dsl = cmd.resolveQuery();
      expect(dsl).toContain('results="basic"');
    });

    it("should generate DSL with results='publisher'", () => {
      const cmd = new ExtractAffiliationsCommand({
        affiliations: [{ affiliation: "Test" }],
        results: "publisher",
      });

      const dsl = cmd.resolveQuery();
      expect(dsl).toContain('results="publisher"');
    });

    it("should reject invalid results value", () => {
      expect(() => {
        new ExtractAffiliationsCommand({
          affiliations: [{ affiliation: "Test" }],
          results: "invalid" as "basic",
        });
      }).toThrow(ValidationError);
    });
  });

  describe("endpoint resolution", () => {
    it("should resolve to DSL v2 endpoint", () => {
      const cmd = new ExtractAffiliationsCommand({
        affiliations: [{ affiliation: "Test" }],
      });

      expect(cmd.resolveEndpoint()).toBe("/api/dsl/v2");
    });
  });
});

describe("ExtractAffiliationsInputSchema", () => {
  it("should validate correct freetext input", () => {
    const result = ExtractAffiliationsInputSchema.safeParse({
      affiliations: [{ affiliation: "Oxford" }],
    });
    expect(result.success).toBe(true);
  });

  it("should validate correct structured input", () => {
    const result = ExtractAffiliationsInputSchema.safeParse({
      affiliations: [{ name: "Stanford", country: "USA" }],
    });
    expect(result.success).toBe(true);
  });

  it("should reject empty array", () => {
    const result = ExtractAffiliationsInputSchema.safeParse({
      affiliations: [],
    });
    expect(result.success).toBe(false);
  });

  it("should reject missing affiliations field", () => {
    const result = ExtractAffiliationsInputSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
