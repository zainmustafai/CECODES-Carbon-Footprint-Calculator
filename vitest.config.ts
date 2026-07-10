import { defineConfig } from "vitest/config";

// Every module under test imports through the @/* alias, which resolve.tsconfigPaths honours.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    globals: false,
    include: ["src/**/*.test.ts"],
  },
});
