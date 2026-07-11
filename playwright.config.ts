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
  // 90s keeps that honest without masking a real hang (a hung test still fails, just later).
  timeout: 90_000,
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
