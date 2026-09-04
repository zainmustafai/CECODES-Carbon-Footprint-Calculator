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
    coverage: {
      provider: "v8",
      // Deliberately no global threshold. The auth use-case register (docs/auth/USE-CASES.md) and
      // its gate (src/lib/auth/__tests__/use-case-coverage.test.ts) already hold every registered
      // AUTH-NN case to "named by a test somewhere"; this holds the auth/mail surfaces themselves
      // to "and every line of it actually runs". Components and hooks are excluded: they are UI,
      // not the logic the register describes, and are exercised by a different kind of test.
      exclude: [
        "**/__tests__/**",
        "src/features/auth/components/**",
        "src/features/auth/hooks/**",
      ],
      thresholds: {
        "src/lib/auth/**": { lines: 100, branches: 100, functions: 100, statements: 100 },
        "src/features/auth/**": { lines: 100, branches: 100, functions: 100, statements: 100 },
        "src/lib/mail/**": { lines: 100, branches: 100, functions: 100, statements: 100 },
        "src/features/admin/actions/user-actions.ts": {
          lines: 100,
          branches: 100,
          functions: 100,
          statements: 100,
        },
      },
    },
  },
});
