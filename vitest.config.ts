import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["apps/mcp/**/*.test.ts"],
    exclude: ["**/*.integration.test.ts", "**/node_modules/**"],
    coverage: {
      provider: "v8",
      include: ["apps/mcp/src/mcp/**", "apps/mcp/src/dsl/schema/**", "apps/mcp/src/client/**"],
      thresholds: {
        lines: 80,
        functions: 75,
        branches: 75,
        statements: 80,
      },
    },
  },
});
