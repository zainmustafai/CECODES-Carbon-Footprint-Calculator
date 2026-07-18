import { loadEnvConfig } from "@next/env";
import { defineConfig, devices } from "@playwright/test";

// globalSetup runs in Playwright's own Node process, which does not read .env.local.
// It needs DIRECT_URL and SUPABASE_SERVICE_ROLE_KEY to provision the fixture tenant.
loadEnvConfig(process.cwd());

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

// One worker. There is a single Supabase project and no local Postgres, so the suite runs
// against a disposable, uniquely named company that global setup creates and teardown
// removes. Never point this at a database whose data you care about.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  // The suite runs against `bun run dev`, not a production build, so pages compile on first
  // hit and every query crosses the Supabase pooler. The data-entry happy path in particular
  // does many autosave round trips over a page that now carries the full ~1700-factor picker.
  // 120s keeps that honest without masking a real hang (a hung test still fails, just later).
  // The suite is dev-server bound, so late in a long run a cold segment compile can push a
  // legitimate navigation past 90s; the extra headroom absorbs that without hiding a true hang.
  timeout: 120_000,
  // The per-assertion default is 5s, which is tight for a dev server that recompiles a segment
  // on first hit and crosses the Supabase pooler on every query. Raising it to 10s removes the
  // borderline flakes on filtered lists and post-mutation re-renders without weakening any check:
  // a truly missing element still fails, 5s later. See COMPLETION_PROMPT's note on RSC timing.
  expect: { timeout: 10_000 },
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
  },
  projects: [
    // storageState lives on the chromium project, not on the shared `use`, or the setup
    // project would try to load the session file it is about to create.
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: "e2e/.auth/user.json" },
      dependencies: ["setup"],
    },
  ],
  webServer: {
    command: "bun run dev",
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    // Turbopack plus the React Compiler makes a cold start slow.
    timeout: 180_000,
  },
});
