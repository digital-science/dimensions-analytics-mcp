/**
 * Eval suite for identifier lookup tools.
 * Tests DOI, PMID, and entity ID lookups against the live API with well-known identifiers.
 * @module test/integration/suites/lookup
 */

import { custom, fieldEquals, hasField, isSuccess } from "../assertions.js";
import type { EvalSuite } from "../types.js";

export const lookupSuite: EvalSuite = {
  name: "lookup",
  description: "Identifier-based lookups (DOI, PMID, entity ID)",
  cases: [
    {
      name: "get publication by DOI (Watson & Crick 1953)",
      tool: "get_by_doi",
      args: { doi: "10.1038/171737a0" },
      assertions: [
        isSuccess(),
        fieldEquals("found", true),
        hasField("publication"),
        custom("title mentions DNA", (data) => {
          const d = data as Record<string, unknown>;
          const pub = d.publication as Record<string, unknown>;
          const title = String(pub?.title ?? "").toLowerCase();
          return title.includes("nucleic acid") || title.includes("deoxyribose")
            ? true
            : `Expected DNA-related title, got: "${pub?.title}"`;
        }),
      ],
      timeout: 15_000,
    },
    {
      name: "get publication by DOI with custom fields",
      tool: "get_by_doi",
      args: { doi: "10.1038/171737a0", fields: ["title", "year", "times_cited"] },
      assertions: [
        isSuccess(),
        fieldEquals("found", true),
        hasField("publication.title"),
        hasField("publication.year"),
      ],
    },
    {
      name: "get publication by PMID (aspirin and cancer)",
      tool: "get_by_pmid",
      args: { pmid: "17554120" },
      assertions: [isSuccess(), fieldEquals("found", true), hasField("publication")],
    },
    {
      name: "DOI not found returns found=false",
      tool: "get_by_doi",
      args: { doi: "10.9999/does-not-exist-12345" },
      assertions: [isSuccess(), fieldEquals("found", false)],
    },
  ],
};
