/**
 * Tests for the function MCP tools (extract_affiliations, extract_grants).
 * @module test/tools/functions
 */

import { beforeEach, describe, expect, it } from "vitest";
import { registerFunctionTools } from "../../src/mcp/tools/functions.js";
import {
  callTool,
  createMockClient,
  createMockServer,
  parseToolResult,
} from "../helpers/tool-test-harness.js";

describe("function tools", () => {
  let handlers: ReturnType<typeof createMockServer>["handlers"];
  let client: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    const { server, handlers: h } = createMockServer();
    client = createMockClient();
    handlers = h;
    registerFunctionTools(server as never, client as never);
  });

  describe("extract_affiliations", () => {
    it("passes affiliations array to client", async () => {
      const affiliations = [
        { affiliation: "University of Oxford, Department of Physics, UK" },
        { name: "MIT", city: "Cambridge", country: "US" },
      ];
      const extractedAffiliations = [
        { id: "grid.4991.5", name: "University of Oxford", confidence: 0.95 },
        { id: "grid.116068.8", name: "Massachusetts Institute of Technology", confidence: 0.99 },
      ];

      client.extractAffiliations.mockResolvedValueOnce({
        extracted_affiliations: extractedAffiliations,
      });

      await callTool(handlers, "extract_affiliations", { affiliations });

      expect(client.extractAffiliations).toHaveBeenCalledTimes(1);
      expect(client.extractAffiliations).toHaveBeenCalledWith(affiliations);
    });

    it("returns match count and affiliations", async () => {
      const extractedAffiliations = [
        { id: "grid.4991.5", name: "University of Oxford", confidence: 0.95 },
      ];
      client.extractAffiliations.mockResolvedValueOnce({
        extracted_affiliations: extractedAffiliations,
      });

      const result = await callTool(handlers, "extract_affiliations", {
        affiliations: [{ affiliation: "University of Oxford, UK" }],
      });
      const data = parseToolResult(result);

      expect(data.matchCount).toBe(1);
      expect(data.affiliations).toEqual(extractedAffiliations);
    });

    it("handles errors gracefully", async () => {
      client.extractAffiliations.mockRejectedValueOnce(new Error("Resolution failed"));

      const result = await callTool(handlers, "extract_affiliations", {
        affiliations: [{ affiliation: "Unknown Org" }],
      });
      const data = parseToolResult(result);

      expect(result.isError).toBe(true);
      expect(data.error).toBe("Resolution failed");
    });
  });

  describe("extract_grants", () => {
    it("maps parameter names correctly", async () => {
      client.extractGrants.mockResolvedValueOnce({
        extracted_grants: [{ id: "grant.1", title: "NIH R01 Grant" }],
      });

      await callTool(handlers, "extract_grants", {
        grant_number: "R01HL117329",
        fundref: "100000050",
        funder_name: "NIH",
      });

      expect(client.extractGrants).toHaveBeenCalledTimes(1);
      expect(client.extractGrants).toHaveBeenCalledWith({
        grantNumber: "R01HL117329",
        fundref: "100000050",
        funderName: "NIH",
      });
    });

    it("returns match count and grants", async () => {
      client.extractGrants.mockResolvedValueOnce({
        grant_id: "grant.2544064",
      });

      const result = await callTool(handlers, "extract_grants", {
        grant_number: "R01HL117329",
      });
      const data = parseToolResult(result);

      expect(data.matchCount).toBe(1);
      expect(data.grants).toEqual([{ grant_id: "grant.2544064" }]);
    });

    it("returns zero matches when grant_id is null", async () => {
      client.extractGrants.mockResolvedValueOnce({
        grant_id: null,
      });

      const result = await callTool(handlers, "extract_grants", {
        grant_number: "NONEXISTENT-123",
      });
      const data = parseToolResult(result);

      expect(data.matchCount).toBe(0);
      expect(data.grants).toEqual([]);
    });

    it("passes only grant_number when optional params are omitted", async () => {
      client.extractGrants.mockResolvedValueOnce({
        grant_id: null,
      });

      await callTool(handlers, "extract_grants", {
        grant_number: "ABC-123",
      });

      expect(client.extractGrants).toHaveBeenCalledWith({
        grantNumber: "ABC-123",
        fundref: undefined,
        funderName: undefined,
      });
    });

    it("handles errors gracefully", async () => {
      client.extractGrants.mockRejectedValueOnce(new Error("Grant lookup failed"));

      const result = await callTool(handlers, "extract_grants", {
        grant_number: "R01HL117329",
      });
      const data = parseToolResult(result);

      expect(result.isError).toBe(true);
      expect(data.error).toBe("Grant lookup failed");
    });
  });
});
