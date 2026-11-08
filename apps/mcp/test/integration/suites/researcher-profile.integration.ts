/**
 * Eval suite for the researcher_profile tool against the live API.
 * @module test/integration/suites/researcher-profile
 */

import {
  arrayMinLength,
  custom,
  everyItem,
  fieldAtLeast,
  fieldEquals,
  fieldMatches,
  hasField,
  isSuccess,
} from "../assertions.js";
import type { EvalSuite } from "../types.js";

const DOUDNA_ID = "ur.01147702313.96";

/** Co-authors never include the profiled researcher. */
const excludesSelf = custom("coauthors exclude the researcher", (data) => {
  const profile = (data as { profile?: { coauthors?: Array<{ id?: string }> } }).profile;
  const coauthors = profile?.coauthors ?? [];
  return coauthors.every((c) => c.id !== DOUDNA_ID) || "researcher listed as own co-author";
});

export const researcherProfileSuite: EvalSuite = {
  name: "researcher_profile",
  description: "One-call researcher aggregation from DSL queries",
  cases: [
    {
      name: "researcher profile by id (Jennifer Doudna)",
      tool: "researcher_profile",
      args: { researcherId: DOUDNA_ID, publicationLimit: 5, grantLimit: 5, facetLimit: 5 },
      assertions: [
        isSuccess(),
        fieldEquals("found", true),
        fieldEquals("profile.researcher.id", DOUDNA_ID),
        fieldAtLeast("profile.publications.totalCount", 100),
        arrayMinLength("profile.publications.items", 1),
        hasField("profile.grants.totalCount"),
        hasField("profile.clinicalTrials.totalCount"),
        arrayMinLength("profile.patents.items", 1),
        arrayMinLength("profile.fieldsOfResearch", 1),
        everyItem("profile.fieldsOfResearch", [fieldMatches("name", /^\d{2} /)]),
        arrayMinLength("profile.funders", 1),
        arrayMinLength("profile.collaboratingOrgs", 1),
        arrayMinLength("profile.coauthors", 5),
        excludesSelf,
      ],
      timeout: 90_000,
    },
    {
      name: "researcher profile by ORCID",
      tool: "researcher_profile",
      args: { orcid: "0000-0001-9161-999X", publicationLimit: 3, facetLimit: 3 },
      assertions: [
        isSuccess(),
        fieldEquals("found", true),
        fieldEquals("profile.researcher.id", DOUDNA_ID),
      ],
      timeout: 90_000,
    },
    {
      name: "researcher profile by name",
      tool: "researcher_profile",
      args: { name: "Jennifer Doudna", publicationLimit: 3, facetLimit: 3 },
      assertions: [isSuccess(), fieldEquals("found", true), hasField("profile.researcher.id")],
      timeout: 90_000,
    },
    {
      name: "researcher profile not found",
      tool: "researcher_profile",
      args: { researcherId: "ur.0000000000.00" },
      assertions: [isSuccess(), fieldEquals("found", false), hasField("message")],
      timeout: 30_000,
    },
  ],
};
