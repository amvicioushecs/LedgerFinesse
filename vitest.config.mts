import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/lib/**/*.ts"],
      exclude: ["src/lib/**/*.test.ts", "src/lib/rules-engine/test-helpers.ts"],
      thresholds: {
        "src/lib/rules-engine/**": { branches: 95 },
      },
    },
  },
});
