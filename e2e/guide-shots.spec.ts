import { test, type Locator, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";

// Capture tool, NOT a test. Skipped unless CAPTURE_SHOTS is set, so the normal suite never runs it.
// Run with:  CAPTURE_SHOTS=1 bunx playwright test guide-shots --no-deps
//
// The standalone chromium.launch() does not start on this machine, but the Playwright RUNNER does,
// so screenshots for the user guide are captured through a spec. It signs into the seeded demo
// tenants (all fake, "Demo " prefix) and shoots each screen. DEMO_PASSWORD comes from .env.local.
//
// Two kinds of shot: full-page (context) and FOCUSED (a close-up of one control, outlined in red),
// which is what a first-time reader needs, a picture that points at the exact thing to click.

const RUN = Boolean(process.env.CAPTURE_SHOTS);
const OUT = "docs/images/guide";
const PASSWORD = process.env.DEMO_PASSWORD ?? "Demo-Cecodes-2026!";

test.use({ storageState: { cookies: [], origins: [] } });
test.describe.configure({ mode: "serial", timeout: 180_000 });

async function login(page: Page, email: string) {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', PASSWORD);
  await page.getByRole("button", { name: /ingresar/i }).click();
  await page.waitForURL(/\/(dashboard|onboarding)/, { waitUntil: "domcontentloaded" }).catch(() => {});
  await page.waitForLoadState("networkidle").catch(() => {});
}

async function shot(page: Page, name: string, fullPage = true) {
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage });
}

// Outline a control in red and screenshot a tight region around it. Defensive: a missing control
// skips its shot rather than failing the whole capture.
async function focus(page: Page, target: Locator, name: string, pad = 22) {
  const el = target.first();
  try {
    await el.scrollIntoViewIfNeeded({ timeout: 5000 });
    await page.waitForTimeout(400);
    const box = await el.boundingBox();
    if (!box) {
      await page.screenshot({ path: `${OUT}/${name}.png` });
      return;
    }
    // Draw a SEPARATE fixed overlay ring over the element rather than styling the element itself:
    // React re-renders the control and wipes an inline style before the screenshot, but it never
    // touches this appended div. boundingBox coords are viewport-relative, which is what fixed
    // positioning uses.
    await page.evaluate((b) => {
      const d = document.createElement("div");
      d.id = "__guide_hl";
      Object.assign(d.style, {
        position: "fixed",
        left: `${b.x - 4}px`,
        top: `${b.y - 4}px`,
        width: `${b.width + 8}px`,
        height: `${b.height + 8}px`,
        border: "3px solid #e11d48",
        borderRadius: "8px",
        boxShadow: "0 0 0 4px rgba(225,29,72,0.22)",
        pointerEvents: "none",
        zIndex: "2147483647",
      } as Partial<CSSStyleDeclaration>);
      document.body.appendChild(d);
    }, box);
    const vw = page.viewportSize() ?? { width: 1440, height: 900 };
    await page.screenshot({
      path: `${OUT}/${name}.png`,
      clip: {
        x: Math.max(0, box.x - pad),
        y: Math.max(0, box.y - pad),
        width: Math.min(vw.width - Math.max(0, box.x - pad), box.width + pad * 2),
        height: Math.min(vw.height - Math.max(0, box.y - pad), box.height + pad * 2),
      },
    });
    await page.evaluate(() => document.getElementById("__guide_hl")?.remove());
  } catch (err) {
    console.log(`  focus skip ${name}: ${(err as Error).message.split("\n")[0]}`);
  }
}

async function openScope1WithSource(page: Page) {
  await page.goto("/data-entry", { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.getByRole("tab", { name: /Alcance 1/ }).click().catch(() => {});
  await page.waitForTimeout(600);
}

test("capture guide screenshots", async ({ page }) => {
  test.skip(!RUN, "set CAPTURE_SHOTS=1 to run");
  mkdirSync(OUT, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 900 });

  // ---- Signed out: the login page + a focused shot of the form ----
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  await shot(page, "01-login", false);
  await focus(page, page.locator("form"), "10-login-form");

  // ---- demo1: rich tenant ----
  await login(page, "demo1@demo.cecodes.invalid");
  await shot(page, "02-dashboard");
  // The left menu.
  await focus(page, page.getByRole("navigation").first(), "11-menu", 8);

  // Data entry, Alcance 1.
  await openScope1WithSource(page);
  await shot(page, "03-data-entry-scope1");
  await focus(page, page.getByRole("tablist").first(), "12-alcance-tabs", 10);
  await focus(page, page.getByRole("switch").first(), "13-aplica-switch", 40);
  await focus(page, page.getByRole("button", { name: /agregar fuente/i }).first(), "14-agregar-fuente");
  await focus(page, page.getByLabel(/valor anual/i).first(), "15-valor-anual", 30);
  await focus(page, page.getByText(/se guarda autom|guardado/i).first(), "16-guardado", 20);

  // Alcance 2, the twelve months and the copy shortcut.
  await page.getByRole("tab", { name: /Alcance 2/ }).click().catch(() => {});
  await page.waitForTimeout(800);
  await shot(page, "04-data-entry-scope2");
  await focus(page, page.getByLabel(/^enero/i).first(), "17-month-box", 24);
  await focus(page, page.getByRole("button", { name: /copiar enero/i }).first(), "18-copiar-enero");

  // Resumen and its export buttons.
  await page.goto("/preview", { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  await shot(page, "05-resumen");
  await focus(page, page.getByRole("button", { name: /descargar pdf/i }).first(), "19-export-buttons", 60);

  await page.goto("/company", { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  await shot(page, "06-company");

  // ---- demo2: empty first-time state ----
  await page.context().clearCookies();
  await login(page, "demo2@demo.cecodes.invalid");
  await shot(page, "07-empty-dashboard");

  // ---- demo3: the missing-grid-factor warning, and a focused shot of the year picker ----
  await page.context().clearCookies();
  await login(page, "demo3@demo.cecodes.invalid");
  await page.goto("/data-entry", { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  await focus(page, page.getByText(/año/i).first(), "20-sede-year", 120);
  await page.getByRole("tab", { name: /Alcance 2/ }).click().catch(() => {});
  await page.waitForTimeout(800);
  await shot(page, "08-missing-grid-factor");
});
