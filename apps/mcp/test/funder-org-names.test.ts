/**
 * @module test/funder-org-names
 */

import { describe, expect, it } from "vitest";
import { resolveFunderOrgName } from "../src/mcp/funder-org-names.js";

describe("resolveFunderOrgName", () => {
  it("resolves common acronyms case-insensitively", () => {
    expect(resolveFunderOrgName("NCI")).toBe("National Cancer Institute");
    expect(resolveFunderOrgName("nci")).toBe("National Cancer Institute");
    expect(resolveFunderOrgName("NSF")).toBe("National Science Foundation");
    expect(resolveFunderOrgName("NIH")).toBe("National Institutes of Health");
  });

  it("passes through unknown names unchanged", () => {
    expect(resolveFunderOrgName("European Commission")).toBe("European Commission");
    expect(resolveFunderOrgName("  Custom Funder  ")).toBe("Custom Funder");
  });
});
