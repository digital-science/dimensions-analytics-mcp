/**
 * Tests for always-on identity fields (WEBAPPDEV-13816).
 * @module test/identity-fields
 */

import { describe, expect, it } from "vitest";
import { identityFieldsFor, mergeIdentityFields } from "../src/mcp/identity-fields.js";

describe("identityFieldsFor", () => {
  it("requires id and doi for publications", () => {
    expect(identityFieldsFor("publications")).toEqual(["id", "doi"]);
  });

  it("requires id for other searchable entity types", () => {
    expect(identityFieldsFor("grants")).toEqual(["id"]);
    expect(identityFieldsFor("researchers")).toEqual(["id"]);
    expect(identityFieldsFor("organizations")).toEqual(["id"]);
    expect(identityFieldsFor("patents")).toEqual(["id"]);
  });
});

describe("mergeIdentityFields", () => {
  it("uses basics plus identity fields when the caller omits fields", () => {
    expect(mergeIdentityFields("publications")).toEqual(["basics", "id", "doi"]);
    expect(mergeIdentityFields("grants")).toEqual(["basics", "id"]);
  });

  it("prepends missing identity fields to an explicit field list", () => {
    expect(mergeIdentityFields("publications", ["title", "year"])).toEqual([
      "id",
      "doi",
      "title",
      "year",
    ]);
  });

  it("does not duplicate identity fields the caller already requested", () => {
    expect(mergeIdentityFields("publications", ["id", "title", "doi"])).toEqual([
      "id",
      "doi",
      "title",
    ]);
  });
});
