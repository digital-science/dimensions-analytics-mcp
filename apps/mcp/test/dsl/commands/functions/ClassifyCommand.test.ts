import { describe, expect, it } from "vitest";
import { ValidationError } from "../../../../src/client/index.js";
import { ClassifyCommand } from "../../../../src/dsl/commands/functions/ClassifyCommand.js";

describe("ClassifyCommand", () => {
  describe("constructor validation", () => {
    it("creates command with title only", () => {
      const cmd = new ClassifyCommand({
        title: "Machine learning",
        system: "FOR",
      });

      expect(cmd.input.title).toBe("Machine learning");
      expect(cmd.input.abstract).toBeUndefined();
      expect(cmd.input.system).toBe("FOR");
    });

    it("creates command with abstract only", () => {
      const cmd = new ClassifyCommand({
        abstract: "This study examines...",
        system: "SDG",
      });

      expect(cmd.input.title).toBeUndefined();
      expect(cmd.input.abstract).toBe("This study examines...");
      expect(cmd.input.system).toBe("SDG");
    });

    it("creates command with both title and abstract", () => {
      const cmd = new ClassifyCommand({
        title: "Test Title",
        abstract: "Test Abstract",
        system: "RCDC",
      });

      expect(cmd.input.title).toBe("Test Title");
      expect(cmd.input.abstract).toBe("Test Abstract");
      expect(cmd.input.system).toBe("RCDC");
    });

    it("throws ValidationError when neither title nor abstract provided", () => {
      expect(
        () =>
          new ClassifyCommand({
            system: "FOR",
          } as never),
      ).toThrow(ValidationError);
    });

    it("accepts all valid classification systems", () => {
      const systems = [
        "FOR",
        "FOR_2020",
        "SDG",
        "SDG_2021",
        "RCDC",
        "HRCS_HC",
        "HRCS_RAC",
        "HRA",
        "BRA",
        "ICRP_CSO",
        "ICRP_CT",
        "UOA",
      ] as const;

      for (const system of systems) {
        const cmd = new ClassifyCommand({ title: "Test", system });
        expect(cmd.input.system).toBe(system);
      }
    });
  });

  describe("resolveQuery", () => {
    it("generates DSL with title only", () => {
      const cmd = new ClassifyCommand({
        title: "Burnout in nursing",
        system: "FOR",
      });

      expect(cmd.resolveQuery()).toBe('classify(title="Burnout in nursing", system="FOR")');
    });

    it("generates DSL with abstract only", () => {
      const cmd = new ClassifyCommand({
        abstract: "This research examines...",
        system: "SDG",
      });

      expect(cmd.resolveQuery()).toBe(
        'classify(abstract="This research examines...", system="SDG")',
      );
    });

    it("generates DSL with both title and abstract", () => {
      const cmd = new ClassifyCommand({
        title: "Climate change",
        abstract: "Rising sea levels affect...",
        system: "SDG",
      });

      expect(cmd.resolveQuery()).toBe(
        'classify(title="Climate change", abstract="Rising sea levels affect...", system="SDG")',
      );
    });

    it("escapes quotes in text", () => {
      const cmd = new ClassifyCommand({
        title: 'A "quoted" title',
        system: "FOR",
      });

      expect(cmd.resolveQuery()).toBe('classify(title="A \\"quoted\\" title", system="FOR")');
    });

    it("normalizes newlines in text", () => {
      const cmd = new ClassifyCommand({
        abstract: "Line one\nLine two",
        system: "FOR",
      });

      expect(cmd.resolveQuery()).toBe('classify(abstract="Line one\\nLine two", system="FOR")');
    });
  });

  describe("transformResponse", () => {
    it("transforms valid FOR classification response", () => {
      const cmd = new ClassifyCommand({
        title: "Test",
        system: "FOR",
      });

      const response = {
        FOR: [
          { id: "1117", name: "Public Health and Health Services" },
          { id: "1103", name: "Clinical Sciences" },
        ],
      };

      const result = cmd.transformResponse(response);
      expect(result.FOR).toHaveLength(2);
      expect(result.FOR[0].id).toBe("1117");
      expect(result.FOR[0].name).toBe("Public Health and Health Services");
    });

    it("transforms valid SDG classification response", () => {
      const cmd = new ClassifyCommand<"SDG">({
        title: "Test",
        system: "SDG",
      });

      const response = {
        SDG: [{ id: "3", name: "Good Health and Well-being" }],
      };

      const result = cmd.transformResponse(response);
      expect(result.SDG).toHaveLength(1);
      expect(result.SDG[0].id).toBe("3");
    });

    it("throws ValidationError for invalid response structure", () => {
      const cmd = new ClassifyCommand({
        title: "Test",
        system: "FOR",
      });

      expect(() => cmd.transformResponse("not an object")).toThrow(ValidationError);
      expect(() => cmd.transformResponse({ FOR: "not an array" })).toThrow(ValidationError);
    });
  });
});
