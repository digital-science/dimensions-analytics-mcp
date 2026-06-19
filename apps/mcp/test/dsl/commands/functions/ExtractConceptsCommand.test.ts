import { describe, expect, it } from "vitest";
import { ValidationError } from "../../../../src/client/index.js";
import { ExtractConceptsCommand } from "../../../../src/dsl/commands/functions/ExtractConceptsCommand.js";

describe("ExtractConceptsCommand", () => {
  describe("constructor validation", () => {
    it("creates command with required text", () => {
      const cmd = new ExtractConceptsCommand({
        text: "Machine learning algorithms",
      });

      expect(cmd.input.text).toBe("Machine learning algorithms");
      expect(cmd.input.returnScores).toBe(false);
    });

    it("creates command with returnScores true", () => {
      const cmd = new ExtractConceptsCommand({
        text: "Test text",
        returnScores: true,
      });

      expect(cmd.input.text).toBe("Test text");
      expect(cmd.input.returnScores).toBe(true);
    });

    it("defaults returnScores to false", () => {
      const cmd = new ExtractConceptsCommand({
        text: "Test text",
      });

      expect(cmd.input.returnScores).toBe(false);
    });

    it("throws ValidationError for empty text", () => {
      expect(() => new ExtractConceptsCommand({ text: "" })).toThrow(ValidationError);
    });
  });

  describe("resolveQuery", () => {
    it("generates DSL without return_scores", () => {
      const cmd = new ExtractConceptsCommand({
        text: "Neural networks for drug discovery",
      });

      expect(cmd.resolveQuery()).toBe('extract_concepts("Neural networks for drug discovery")');
    });

    it("generates DSL with return_scores=true", () => {
      const cmd = new ExtractConceptsCommand({
        text: "Neural networks for drug discovery",
        returnScores: true,
      });

      expect(cmd.resolveQuery()).toBe(
        'extract_concepts("Neural networks for drug discovery", return_scores=true)',
      );
    });

    it("escapes quotes in text", () => {
      const cmd = new ExtractConceptsCommand({
        text: 'Text with "quotes"',
      });

      expect(cmd.resolveQuery()).toBe('extract_concepts("Text with \\"quotes\\"")');
    });

    it("normalizes newlines in text", () => {
      const cmd = new ExtractConceptsCommand({
        text: "Line one\nLine two\nLine three",
      });

      expect(cmd.resolveQuery()).toBe('extract_concepts("Line one\\nLine two\\nLine three")');
    });
  });

  describe("transformResponse", () => {
    it("transforms simple concept array response", () => {
      const cmd = new ExtractConceptsCommand({
        text: "Test",
      });

      const response = {
        extracted_concepts: ["machine learning", "neural networks", "deep learning"],
      };

      const result = cmd.transformResponse(response);
      expect(result.extracted_concepts).toHaveLength(3);
      expect(result.extracted_concepts[0]).toBe("machine learning");
    });

    it("transforms concepts with scores response", () => {
      const cmd = new ExtractConceptsCommand({
        text: "Test",
        returnScores: true,
      });

      const response = {
        extracted_concepts: [
          { concept: "machine learning", relevance: 0.95 },
          { concept: "neural networks", relevance: 0.87 },
        ],
      };

      const result = cmd.transformResponse(response);
      expect(result.extracted_concepts).toHaveLength(2);
      expect((result.extracted_concepts[0] as { concept: string; relevance: number }).concept).toBe(
        "machine learning",
      );
      expect(
        (result.extracted_concepts[0] as { concept: string; relevance: number }).relevance,
      ).toBe(0.95);
    });

    it("throws ValidationError for invalid response structure", () => {
      const cmd = new ExtractConceptsCommand({
        text: "Test",
      });

      expect(() => cmd.transformResponse("not an object")).toThrow(ValidationError);
      expect(() => cmd.transformResponse({ wrong_key: [] })).toThrow(ValidationError);
    });

    it("throws ValidationError when expecting scores but gets strings", () => {
      const cmd = new ExtractConceptsCommand({
        text: "Test",
        returnScores: true,
      });

      const response = {
        extracted_concepts: ["machine learning", "neural networks"],
      };

      expect(() => cmd.transformResponse(response)).toThrow(ValidationError);
    });
  });
});
