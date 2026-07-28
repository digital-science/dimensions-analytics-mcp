/**
 * Eval suite for similar_documents tool.
 * @module test/integration/suites/similar-documents
 */

import { arrayMinLength, fieldAtLeast, hasField, isSuccess } from "../assertions.js";
import type { EvalSuite } from "../types.js";

const SAMPLE_ABSTRACT =
  "After spinal cord injury, macrophages infiltrate the lesion site and contribute to both tissue damage and repair processes. Understanding macrophage polarization could lead to novel therapeutic strategies.";

const SAMPLE_GRANT_TEXT =
  "Development of novel cancer immunotherapy approaches using checkpoint inhibitors and CAR-T cell engineering for solid tumors.";

export const similarDocumentsSuite: EvalSuite = {
  name: "similar_documents",
  description: "Concept-based similar document search for publications and grants",
  cases: [
    {
      name: "similar publications from abstract text",
      tool: "similar_documents",
      args: {
        entityType: "publications",
        text: SAMPLE_ABSTRACT,
        yearFrom: 2016,
        limit: 5,
        fields: ["id", "title", "year"],
      },
      assertions: [
        isSuccess(),
        hasField("totalCount"),
        fieldAtLeast("totalCount", 1),
        arrayMinLength("publications", 1),
      ],
      timeout: 60_000,
    },
    {
      name: "similar grants from description text",
      tool: "similar_documents",
      args: {
        entityType: "grants",
        text: SAMPLE_GRANT_TEXT,
        yearFrom: 2020,
        limit: 5,
        fields: ["id", "title"],
      },
      assertions: [isSuccess(), hasField("totalCount"), arrayMinLength("grants", 1)],
      timeout: 60_000,
    },
  ],
};
