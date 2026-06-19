import { describe, expect, it } from "vitest";
import { ValidationError } from "../../../src/client/index.js";
import { validateFieldName } from "../../../src/dsl/utils/validate-field-name.js";

describe("validateFieldName", () => {
  const validFields = [
    "year",
    "times_cited",
    "authors.first_name",
    "FOR_first",
    "mesh_terms",
    "a",
    "_internal",
    "A1",
  ];

  for (const field of validFields) {
    it(`accepts valid field name: ${field}`, () => {
      expect(() => validateFieldName(field)).not.toThrow();
    });
  }

  const injectionPayloads = [
    "year >= 2020 return publications limit 1 //",
    'year" return publications //',
    "field\nreturn publications",
    "field; DROP TABLE",
    "field name",
    "",
    "123field",
    "field--comment",
  ];

  for (const payload of injectionPayloads) {
    it(`rejects invalid field name: ${JSON.stringify(payload)}`, () => {
      expect(() => validateFieldName(payload)).toThrow(ValidationError);
    });
  }

  it("rejects field starting with dot", () => {
    expect(() => validateFieldName(".field")).toThrow(ValidationError);
  });

  it("rejects field with only dots", () => {
    expect(() => validateFieldName("...")).toThrow(ValidationError);
  });

  it("rejects field with brackets", () => {
    expect(() => validateFieldName("field[0]")).toThrow(ValidationError);
  });

  it("rejects field with parentheses", () => {
    expect(() => validateFieldName("count(year)")).toThrow(ValidationError);
  });
});
