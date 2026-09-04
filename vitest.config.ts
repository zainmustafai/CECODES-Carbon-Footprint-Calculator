import { defineConfig } from "vitest/config";

// Every module under test imports through the @/* alias, which resolve.tsconfigPaths honours.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    globals: false,
    include: ["src/**/*.test.ts"],
    // Vitest defaults to 5000ms, which the PDF tests do not reliably fit inside. build-pdf.test.ts
    // renders whole documents through @react-pdf/renderer and lays out real pages: the layout
    // cases take 3.5-4.5s on a fast machine, so a slower CI box crosses the default and fails a
    // test whose logic is fine. The failure looks like a PDF bug and is not one. Raised well past
    // the observed worst case rather than to a value the next slower machine also trips.
    testTimeout: 30_000,
  },
});
