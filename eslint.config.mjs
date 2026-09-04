import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // The legacy prototype we reverse engineered. Git ignored, read only, not ours to fix.
    "reference/**",
    // Written by `prisma generate`.
    "src/lib/generated/**",
    "playwright-report/**",
    "test-results/**",
    // Written by `bun run test:coverage`. Gitignored, and its bundled istanbul reporter assets
    // carry an eslint-disable this config has no rule for, so anyone who ran coverage once got a
    // standing warning about a file nobody wrote and nobody ships.
    "coverage/**",
  ]),
]);

export default eslintConfig;
