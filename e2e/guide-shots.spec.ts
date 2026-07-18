import { test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";

// Capture tool, NOT a test. Skipped unless CAPTURE_SHOTS is set, so the normal suite never runs it.
// Run with:  CAPTURE_SHOTS=1 bunx playwright test guide-shots --no-deps
//
// The standalone chromium.launch() does not start on this machine, but the Playwright RUNNER does,
// so screenshots for docs/USER_GUIDE.md are captured through a spec. It signs into the seeded demo
// tenants (all fake, "Demo " prefix) and shoots each screen. DEMO_PASSWORD comes from .env.local,
// which playwright.config loads via loadEnvConfig.

const RUN = Boolean(process.env.CAPTURE_SHOTS);
const OUT = "docs/images/guide";
const PASSWORD = process.env.DEMO_PASSWORD ?? "Demo-Cecodes-2026!";

// Start signed out; this spec does its own demo logins rather than the E2E fixture session.
test.use({ storageState: { cookies: [], origins: [] } });
test.describe.configure({ mode: "serial", timeout: 120_000 });

async function login(page: Page, email: string) {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', PASSWORD);
  await page.getByRole("button", { name: /ingresar/i }).click();
  await page.waitForURL(/\/(dashboard|onboarding)/, { waitUntil: "domcontentloaded" }).catch(() => {});
  await page.waitForLoadState("networkidle").catch(() => {});
}

async function shot(page: Page, name: string, fullPage = true) {
  await page.waitForTimeout(1500); // let charts and RSC settle
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage });
}

test("capture guide screenshots", async ({ page }) => {
  test.skip(!RUN, "set CAPTURE_SHOTS=1 to run");
  mkdirSync(OUT, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 900 });

  // Signed-out login page.
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  await shot(page, "01-login", false);

  // demo1: the rich tenant.
  await login(page, "demo1@demo.cecodes.invalid");
  await shot(page, "02-dashboard");

  await page.goto("/data-entry", { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.getByRole("tab", { name: /Alcance 1/ }).click().catch(() => {});
  await shot(page, "03-data-entry-scope1");

  await page.getByRole("tab", { name: /Alcance 2/ }).click().catch(() => {});
  await shot(page, "04-data-entry-scope2");

  await page.goto("/preview", { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  await shot(page, "05-resumen");

  await page.goto("/company", { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  await shot(page, "06-company");

  // demo2: empty states.
  await page.context().clearCookies();
  await login(page, "demo2@demo.cecodes.invalid");
  await shot(page, "07-empty-dashboard");

  // demo3: the missing-grid-factor warning (2025).
  await page.context().clearCookies();
  await login(page, "demo3@demo.cecodes.invalid");
  await page.goto("/data-entry", { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.getByRole("tab", { name: /Alcance 2/ }).click().catch(() => {});
  await shot(page, "08-missing-grid-factor");
});
