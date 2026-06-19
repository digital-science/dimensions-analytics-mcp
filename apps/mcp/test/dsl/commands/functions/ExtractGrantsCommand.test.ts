/**
 * Tests for ExtractGrantsCommand.
 * @module test/commands/functions/ExtractGrantsCommand
 */

import { describe, expect, it } from "vitest";
import { ValidationError } from "../../../../src/client/index.js";
import {
  ExtractGrantsCommand,
  ExtractGrantsInputSchema,
} from "../../../../src/dsl/commands/functions/ExtractGrantsCommand.js";

describe("ExtractGrantsCommand", () => {
  describe("input validation", () => {
    it("should accept valid grant number with fundref", () => {
      const input = {
        grantNumber: "R01HL117329",
        fundref: "100000050",
      };

      const cmd = new ExtractGrantsCommand(input);
      expect(cmd.input.grantNumber).toBe("R01HL117329");
      expect(cmd.input.fundref).toBe("100000050");
    });

    it("should accept valid grant number with funder name", () => {
      const input = {
        grantNumber: "HL117648",
        funderName: "NIH",
      };

      const cmd = new ExtractGrantsCommand(input);
      expect(cmd.input.grantNumber).toBe("HL117648");
      expect(cmd.input.funderName).toBe("NIH");
    });

    it("should accept grant number only", () => {
      const input = {
        grantNumber: "R01HL117329",
      };

      const cmd = new ExtractGrantsCommand(input);
      expect(cmd.input.grantNumber).toBe("R01HL117329");
    });

    it("should reject empty grant number", () => {
      expect(() => {
        new ExtractGrantsCommand({ grantNumber: "" });
      }).toThrow(ValidationError);
    });

    it("should reject missing grant number", () => {
      expect(() => {
        new ExtractGrantsCommand({} as { grantNumber: string });
      }).toThrow(ValidationError);
    });
  });

  describe("DSL generation", () => {
    it("should generate correct DSL with fundref", () => {
      const cmd = new ExtractGrantsCommand({
        grantNumber: "R01HL117329",
        fundref: "100000050",
      });

      const dsl = cmd.resolveQuery();
      expect(dsl).toBe('extract_grants(grant_number="R01HL117329", fundref="100000050")');
    });

    it("should generate correct DSL with funder name", () => {
      const cmd = new ExtractGrantsCommand({
        grantNumber: "HL117648",
        funderName: "NIH",
      });

      const dsl = cmd.resolveQuery();
      expect(dsl).toBe('extract_grants(grant_number="HL117648", funder_name="NIH")');
    });

    it("should generate correct DSL with only grant number", () => {
      const cmd = new ExtractGrantsCommand({
        grantNumber: "R01HL117329",
      });

      const dsl = cmd.resolveQuery();
      expect(dsl).toBe('extract_grants(grant_number="R01HL117329")');
    });

    it("should escape quotes in grant number", () => {
      const cmd = new ExtractGrantsCommand({
        grantNumber: 'Grant "Test" 123',
      });

      const dsl = cmd.resolveQuery();
      expect(dsl).toContain('\\"Test\\"');
    });

    it("should prefer fundref over funderName when both provided", () => {
      const cmd = new ExtractGrantsCommand({
        grantNumber: "R01HL117329",
        fundref: "100000050",
        funderName: "NIH",
      });

      const dsl = cmd.resolveQuery();
      expect(dsl).toContain("fundref=");
      expect(dsl).not.toContain("funder_name=");
    });
  });

  describe("response transformation", () => {
    it("should transform a successful grant resolution", () => {
      const cmd = new ExtractGrantsCommand({
        grantNumber: "R01HL117329",
        fundref: "100000050",
      });

      const response = { grant_id: "grant.2544064" };
      const result = cmd.transformResponse(response);

      expect(result.grant_id).toBe("grant.2544064");
    });

    it("should handle null grant_id when no match found", () => {
      const cmd = new ExtractGrantsCommand({
        grantNumber: "UNKNOWN123",
      });

      const response = { grant_id: null };
      const result = cmd.transformResponse(response);

      expect(result.grant_id).toBeNull();
    });

    it("should throw ValidationError for invalid response structure", () => {
      const cmd = new ExtractGrantsCommand({
        grantNumber: "R01HL117329",
      });

      expect(() => {
        cmd.transformResponse({ invalid: "response" });
      }).toThrow(ValidationError);
    });

    it("should throw ValidationError for missing grant_id key", () => {
      const cmd = new ExtractGrantsCommand({
        grantNumber: "R01HL117329",
      });

      expect(() => {
        cmd.transformResponse({});
      }).toThrow(ValidationError);
    });
  });

  describe("endpoint resolution", () => {
    it("should resolve to DSL v2 endpoint", () => {
      const cmd = new ExtractGrantsCommand({
        grantNumber: "R01HL117329",
      });

      expect(cmd.resolveEndpoint()).toBe("/api/dsl/v2");
    });
  });
});

describe("ExtractGrantsInputSchema", () => {
  it("should validate correct input with fundref", () => {
    const result = ExtractGrantsInputSchema.safeParse({
      grantNumber: "R01HL117329",
      fundref: "100000050",
    });
    expect(result.success).toBe(true);
  });

  it("should validate correct input with funder name", () => {
    const result = ExtractGrantsInputSchema.safeParse({
      grantNumber: "HL117648",
      funderName: "NIH",
    });
    expect(result.success).toBe(true);
  });

  it("should validate correct input with only grant number", () => {
    const result = ExtractGrantsInputSchema.safeParse({
      grantNumber: "R01HL117329",
    });
    expect(result.success).toBe(true);
  });

  it("should reject empty grant number", () => {
    const result = ExtractGrantsInputSchema.safeParse({
      grantNumber: "",
    });
    expect(result.success).toBe(false);
  });

  it("should reject missing grantNumber field", () => {
    const result = ExtractGrantsInputSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
