/**
 * Captures real screenshots of the running app for docs/USER_GUIDE.md.
 * Local-only, never imported by the app. Reads DEMO_PASSWORD from the environment.
 * Run with the dev server up:  bun --env-file=.env.local run scripts/capture-guide-shots.ts
 */
import { chromium, type Page } from "@playwright/test";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const PASSWORD = process.env.DEMO_PASSWORD ?? "Demo-Cecodes-2026!";
const OUT = "docs/images/guide";

async function login(page: Page, email: string) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', PASSWORD);
  await page.getByRole("button", { name: /ingresar|sign in/i }).click();
  // Company users land on /dashboard; wait for the app shell heading.
  await page.waitForURL(/\/(dashboard|onboarding)/, { waitUntil: "domcontentloaded" }).catch(() => {});
  await page.waitForLoadState("networkidle").catch(() => {});
}

async function shot(page: Page, name: string, full = false) {
  try {
    await page.waitForTimeout(1200); // let charts and RSC settle
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: full });
    console.log(`  ok   ${name}.png`);
  } catch (e) {
    console.log(`  FAIL ${name}: ${(e as Error).message}`);
  }
}

async function launch() {
  // The bundled chrome-headless-shell will not start on this machine (launch times out), but the
  // installed Google Chrome / Edge does. Try real browser channels before the bundled build.
  for (const channel of ["chrome", "msedge", undefined]) {
    try {
      return await chromium.launch({ channel, timeout: 45_000 });
    } catch (e) {
      console.log(`  launch(${channel ?? "bundled"}) failed: ${(e as Error).message.split("\n")[0]}`);
    }
  }
  throw new Error("no browser channel could launch");
}

async function main() {
  const browser = await launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  console.log("== login page (signed out) ==");
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  await shot(page, "01-login");

  console.log("== demo1: rich dashboard ==");
  await login(page, "demo1@demo.cecodes.invalid");
  await shot(page, "02-dashboard", true);

  console.log("== demo1: data entry ==");
  await page.goto(`${BASE}/data-entry`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  await shot(page, "03-data-entry", true);
  // Alcance 2 monthly grid: open the tab and expand the electricity source if present.
  try {
    await page.getByRole("tab", { name: /Alcance 2/ }).click({ timeout: 5000 });
    await page.waitForTimeout(800);
    await shot(page, "04-data-entry-scope2", true);
  } catch (e) {
    console.log(`  skip scope2: ${(e as Error).message}`);
  }

  console.log("== demo1: preview / resumen ==");
  await page.goto(`${BASE}/preview`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  await shot(page, "05-preview", true);

  console.log("== demo1: company + sedes ==");
  await page.goto(`${BASE}/company`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  await shot(page, "06-company", true);

  console.log("== demo1: reports ==");
  await page.goto(`${BASE}/reports`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  await shot(page, "07-reports", true);

  console.log("== demo2: empty dashboard ==");
  await context.clearCookies();
  await login(page, "demo2@demo.cecodes.invalid");
  await shot(page, "08-empty-dashboard", true);
  await page.goto(`${BASE}/data-entry`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  await shot(page, "09-empty-data-entry", true);

  console.log("== demo3: missing grid factor warning ==");
  await context.clearCookies();
  await login(page, "demo3@demo.cecodes.invalid");
  await page.goto(`${BASE}/data-entry`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  try {
    await page.getByRole("tab", { name: /Alcance 2/ }).click({ timeout: 5000 });
    await page.waitForTimeout(800);
  } catch {}
  await shot(page, "10-missing-grid-factor", true);

  await browser.close();
  console.log("done");
}

main().catch((e) => {
  console.error("FATAL:", e.message);
  process.exit(1);
});
