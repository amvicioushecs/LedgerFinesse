import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // The Neon Auth SDK imports next/headers without an extension (Next resolves it; Node ESM doesn't). Inlining it
    // lets Vite resolve that import and lets tests mock next/headers for it too.
    server: { deps: { inline: ["@neondatabase/auth"] } },
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
