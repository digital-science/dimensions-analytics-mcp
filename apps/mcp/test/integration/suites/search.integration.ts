/**
 * Eval suite for search_* tools.
 * Tests keyword search across multiple entity types against the live API.
 * @module test/integration/suites/search
 */

import { arrayMinLength, fieldAtLeast, hasField, isSuccess } from "../assertions.js";
import type { EvalSuite } from "../types.js";

export const searchSuite: EvalSuite = {
  name: "search",
  description: "Keyword search tools across entity types",
  cases: [
    {
      name: "search publications for CRISPR",
      tool: "search_publications",
      args: { query: "CRISPR gene editing", limit: 10 },
      assertions: [
        isSuccess(),
        hasField("totalCount"),
        fieldAtLeast("totalCount", 1),
        arrayMinLength("publications", 1),
      ],
    },
    {
      name: "search publications with year filter",
      tool: "search_publications",
      args: { query: "machine learning", yearFrom: 2023, yearTo: 2024, limit: 5 },
      assertions: [isSuccess(), hasField("totalCount"), arrayMinLength("publications", 1)],
    },
    {
      name: "search publications with sort",
      tool: "search_publications",
      args: { query: "deep learning", sortBy: "times_cited", limit: 5 },
      assertions: [isSuccess(), arrayMinLength("publications", 1)],
    },
    {
      name: "search grants for climate research",
      tool: "search_grants",
      args: { query: "climate change adaptation", limit: 5 },
      assertions: [isSuccess(), hasField("totalCount"), arrayMinLength("grants", 1)],
    },
    {
      name: "search researchers for a common name",
      tool: "search_researchers",
      args: { query: "John Smith", limit: 5 },
      assertions: [isSuccess(), hasField("totalCount"), arrayMinLength("researchers", 1)],
    },
    {
      name: "search patents for mRNA",
      tool: "search_patents",
      args: { query: "mRNA vaccine delivery", limit: 5 },
      assertions: [isSuccess(), hasField("totalCount"), arrayMinLength("patents", 1)],
    },
    {
      name: "search clinical trials for Alzheimer",
      tool: "search_clinical_trials",
      args: { query: "Alzheimer disease treatment", limit: 5 },
      assertions: [isSuccess(), hasField("totalCount"), arrayMinLength("clinicalTrials", 1)],
    },
    {
      name: "search datasets for genomics",
      tool: "search_datasets",
      args: { query: "human genome sequencing", limit: 5 },
      assertions: [isSuccess(), hasField("totalCount"), arrayMinLength("datasets", 1)],
    },
    {
      name: "search policy documents for pandemic",
      tool: "search_policy_documents",
      args: { query: "pandemic preparedness", limit: 5 },
      assertions: [isSuccess(), hasField("totalCount"), arrayMinLength("policyDocuments", 1)],
    },
    {
      name: "search organizations for MIT",
      tool: "search_organizations",
      args: { query: "Massachusetts Institute of Technology", limit: 5 },
      assertions: [isSuccess(), hasField("totalCount"), arrayMinLength("organizations", 1)],
    },
  ],
};
