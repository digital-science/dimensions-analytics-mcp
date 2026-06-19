import { describe, expect, it } from "vitest";
import { z } from "zod";
import { Command, type CommandInput, type CommandOutput } from "../../src/client/command.js";

// Test command implementation
const TestInputSchema = z.object({
  query: z.string(),
  limit: z.number().optional().default(10),
});

type TestInput = z.infer<typeof TestInputSchema>;
type TestOutput = { results: string[] };

class TestCommand extends Command<TestInput, TestOutput> {
  static readonly inputSchema = TestInputSchema;
  readonly input: TestInput;

  constructor(input: TestInput) {
    super();
    this.input = TestInputSchema.parse(input);
  }
}

/**
 * Test command with custom resolveQuery implementation.
 */
class QueryCommand extends Command<TestInput, TestOutput> {
  static readonly inputSchema = TestInputSchema;
  readonly input: TestInput;

  constructor(input: TestInput) {
    super();
    this.input = TestInputSchema.parse(input);
  }

  resolveQuery(): string {
    return `search publications for "${this.input.query}" limit ${this.input.limit}`;
  }
}

/**
 * Test command with custom resolveEndpoint implementation.
 */
class CustomEndpointCommand extends Command<TestInput, TestOutput> {
  static readonly inputSchema = TestInputSchema;
  readonly input: TestInput;

  constructor(input: TestInput) {
    super();
    this.input = TestInputSchema.parse(input);
  }

  resolveEndpoint(): string {
    return "/api/custom/v3";
  }
}

/**
 * Test command with transformResponse implementation.
 */
class TransformCommand extends Command<TestInput, TestOutput> {
  static readonly inputSchema = TestInputSchema;
  readonly input: TestInput;

  constructor(input: TestInput) {
    super();
    this.input = TestInputSchema.parse(input);
  }

  transformResponse(response: unknown): TestOutput {
    const raw = response as { data: Array<{ title: string }> };
    return {
      results: raw.data.map((item) => item.title),
    };
  }
}

describe("Command", () => {
  describe("basic functionality", () => {
    it("parses and validates input", () => {
      const cmd = new TestCommand({ query: "test", limit: 5 });
      expect(cmd.input.query).toBe("test");
      expect(cmd.input.limit).toBe(5);
    });

    it("applies default values", () => {
      const cmd = new TestCommand({ query: "test" });
      expect(cmd.input.limit).toBe(10);
    });

    it("throws on invalid input", () => {
      expect(() => new TestCommand({ query: 123 } as unknown as TestInput)).toThrow();
    });

    it("has static inputSchema", () => {
      expect(TestCommand.inputSchema).toBeDefined();
      expect(TestCommand.inputSchema.parse({ query: "x" })).toEqual({
        query: "x",
        limit: 10,
      });
    });
  });

  describe("resolveQuery", () => {
    it("returns undefined by default", () => {
      const cmd = new TestCommand({ query: "test" });
      expect(cmd.resolveQuery).toBeUndefined();
    });

    it("can be overridden to return query string", () => {
      const cmd = new QueryCommand({ query: "machine learning", limit: 5 });
      expect(cmd.resolveQuery?.()).toBe('search publications for "machine learning" limit 5');
    });
  });

  describe("resolveEndpoint", () => {
    it("returns default DSL endpoint", () => {
      const cmd = new TestCommand({ query: "test" });
      expect(cmd.resolveEndpoint()).toBe("/api/dsl/v2");
    });

    it("can be overridden for custom endpoints", () => {
      const cmd = new CustomEndpointCommand({ query: "test" });
      expect(cmd.resolveEndpoint()).toBe("/api/custom/v3");
    });
  });

  describe("transformResponse", () => {
    it("is undefined by default", () => {
      const cmd = new TestCommand({ query: "test" });
      expect(cmd.transformResponse).toBeUndefined();
    });

    it("can be overridden to transform API responses", () => {
      const cmd = new TransformCommand({ query: "test" });
      const rawResponse = {
        data: [
          { title: "First Paper", id: "pub.1" },
          { title: "Second Paper", id: "pub.2" },
        ],
      };
      const transformed = cmd.transformResponse?.(rawResponse);
      expect(transformed).toEqual({
        results: ["First Paper", "Second Paper"],
      });
    });
  });

  describe("type helpers", () => {
    it("CommandInput extracts input type", () => {
      type Input = CommandInput<TestCommand>;
      const input: Input = { query: "test", limit: 10 };
      expect(input.query).toBe("test");
      expect(input.limit).toBe(10);
    });

    it("CommandOutput extracts output type", () => {
      type Output = CommandOutput<TestCommand>;
      const output: Output = { results: ["a", "b"] };
      expect(output.results).toHaveLength(2);
    });
  });
});
