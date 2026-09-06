/**
 * Tests for canonical Dimensions web profile URL construction (WEBAPPDEV-13680).
 * @module test/profile-urls
 */

import { describe, expect, it } from "vitest";
import {
  attachFacetProfileUrls,
  attachProfileUrl,
  attachProfileUrls,
  buildProfileUrl,
  isProfileEntityType,
  PROFILE_ENTITY_TYPES,
  profileEntityForFacetField,
  profileUrlCatalog,
} from "../src/mcp/profile-urls.js";

describe("buildProfileUrl", () => {
  it("builds the canonical researcher profile path, not /discover/researcher/", () => {
    expect(buildProfileUrl("researchers", "ur.01222634304.39")).toBe(
      "https://app.dimensions.ai/details/entities/publication/author/ur.01222634304.39",
    );
    expect(buildProfileUrl("researchers", "ur.01222634304.39")).not.toContain(
      "/discover/researcher/",
    );
  });

  it("builds the canonical organization profile path", () => {
    expect(buildProfileUrl("organizations", "grid.168010.e")).toBe(
      "https://app.dimensions.ai/details/organization/grid.168010.e",
    );
  });

  it("builds document profile paths verified from the DSL dimensions_url field", () => {
    expect(buildProfileUrl("publications", "pub.1015581115")).toBe(
      "https://app.dimensions.ai/details/publication/pub.1015581115",
    );
    expect(buildProfileUrl("grants", "grant.2438800")).toBe(
      "https://app.dimensions.ai/details/grant/grant.2438800",
    );
    expect(buildProfileUrl("patents", "ZW-9994-A1")).toBe(
      "https://app.dimensions.ai/details/patent/ZW-9994-A1",
    );
    expect(buildProfileUrl("clinical_trials", "chictr-trc-14005205")).toBe(
      "https://app.dimensions.ai/details/clinical_trial/chictr-trc-14005205",
    );
    expect(buildProfileUrl("datasets", "dataset.99999999")).toBe(
      "https://app.dimensions.ai/details/data_set/dataset.99999999",
    );
    expect(buildProfileUrl("policy_documents", "policy.9999")).toBe(
      "https://app.dimensions.ai/details/policy_documents/policy.9999",
    );
  });

  it("uses the configured instance host", () => {
    expect(
      buildProfileUrl("researchers", "ur.01222634304.39", "https://your-instance.dimensions.ai/"),
    ).toBe(
      "https://your-instance.dimensions.ai/details/entities/publication/author/ur.01222634304.39",
    );
  });

  it("returns undefined for entity types without a canonical profile page", () => {
    expect(buildProfileUrl("reports", "rep.1")).toBeUndefined();
    expect(buildProfileUrl("source_titles", "jour.1016355")).toBeUndefined();
    expect(buildProfileUrl("funder_groups", "fg.1")).toBeUndefined();
    expect(buildProfileUrl("research_org_groups", "rog.1")).toBeUndefined();
  });

  it("returns undefined for empty ids", () => {
    expect(buildProfileUrl("researchers", "   ")).toBeUndefined();
    expect(buildProfileUrl("researchers", "")).toBeUndefined();
  });
});

describe("isProfileEntityType", () => {
  it("lists the entity types that have profile pages", () => {
    expect(PROFILE_ENTITY_TYPES).toContain("researchers");
    expect(PROFILE_ENTITY_TYPES).toContain("organizations");
    expect(isProfileEntityType("researchers")).toBe(true);
    expect(isProfileEntityType("reports")).toBe(false);
  });
});

describe("attachProfileUrl", () => {
  it("adds profile_url from the record id", () => {
    expect(
      attachProfileUrl("researchers", { id: "ur.01222634304.39", last_name: "Halpern" }),
    ).toEqual({
      id: "ur.01222634304.39",
      last_name: "Halpern",
      profile_url:
        "https://app.dimensions.ai/details/entities/publication/author/ur.01222634304.39",
    });
  });

  it("leaves records without a usable id unchanged", () => {
    const row = { last_name: "Unknown" };
    expect(attachProfileUrl("researchers", row)).toEqual(row);
  });

  it("does not invent a URL for unsupported entity types", () => {
    const row = { id: "rep.1", title: "Report" };
    expect(attachProfileUrl("reports", row)).toEqual(row);
  });
});

describe("attachProfileUrls", () => {
  it("enriches each row", () => {
    const rows = attachProfileUrls("organizations", [{ id: "grid.168010.e", name: "Stanford" }]);
    expect(rows[0]?.profile_url).toBe(
      "https://app.dimensions.ai/details/organization/grid.168010.e",
    );
  });
});

describe("profileEntityForFacetField", () => {
  it("maps researcher and org facet fields to profile entity types", () => {
    expect(profileEntityForFacetField("researchers")).toBe("researchers");
    expect(profileEntityForFacetField("research_orgs")).toBe("organizations");
    expect(profileEntityForFacetField("funder_orgs")).toBe("organizations");
    expect(profileEntityForFacetField("journal")).toBeUndefined();
  });
});

describe("attachFacetProfileUrls", () => {
  it("adds profile_url on researcher facet buckets", () => {
    const buckets = attachFacetProfileUrls("researchers", [{ id: "ur.01222634304.39", count: 12 }]);
    expect(buckets[0]?.profile_url).toBe(
      "https://app.dimensions.ai/details/entities/publication/author/ur.01222634304.39",
    );
  });

  it("leaves journal facet buckets unchanged", () => {
    const buckets = [{ id: "jour.1", name: "Nature", count: 42 }];
    expect(attachFacetProfileUrls("journal", buckets)).toEqual(buckets);
  });
});

describe("profileUrlCatalog", () => {
  it("documents the researcher and organization templates", () => {
    const catalog = profileUrlCatalog();
    expect(catalog.warning).toContain("/details/entities/publication/author/{id}");
    expect(catalog.templates.find((t) => t.entityType === "researchers")?.path).toBe(
      "/details/entities/publication/author/{id}",
    );
    expect(catalog.templates.find((t) => t.entityType === "organizations")?.path).toBe(
      "/details/organization/{id}",
    );
  });
});
