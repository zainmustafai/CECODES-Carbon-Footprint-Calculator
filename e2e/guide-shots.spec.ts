import { test, expect, type Locator, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";

// Capture tool, NOT a test. Skipped unless CAPTURE_SHOTS is set, so the normal suite never runs it.
// Run all of it with:  CAPTURE_SHOTS=1 bunx playwright test guide-shots --no-deps
// Or just one screen, e.g. the empty states:  CAPTURE_SHOTS=1 bunx playwright test guide-shots -g demo2 --no-deps
//
// The standalone chromium.launch() does not start on this machine, but the Playwright RUNNER does,
// so the screenshots for docs/USER_GUIDE.md and its Spanish twin are captured through this spec. It
// signs into the seeded demo tenants (all fake, "Demo " prefix, "@demo.cecodes.invalid" domain) and
// shoots each screen. DEMO_PASSWORD comes from .env.local, which playwright.config loads.
//
// It is split into several independent test() blocks on purpose: each screen gets its own timeout,
// so one slow screen can never eat the budget of the next, and a single screen can be re-captured
// with -g without re-running everything (which matters on a busy machine where the dev server is
// slow). Serial mode keeps them ordered and reuses the browser.
//
// The guide is a click-by-click tutorial, so most shots are CLOSE and FOCUSED on the one control a
// step is about, with a bright box drawn around it (drawOverlays) so the picture points at the thing
// to click. A few stay full-page for orientation.
//
// Two shots need data that only exists once it has been entered THROUGH the tool: the autosave
// "Guardado" pill and the "Historial de cambios" audit trail. The seed writes activity rows directly
// and never touches the audit log, so the data-entry block makes a reversible edit on demo1 (change
// the diesel value, then set it straight back) to produce a real "Guardado" state and real audit
// rows, without moving any published total. Re-run `bun run db:seed:demo` afterwards to reset.
//
// Every shot is defensive: a missing control logs FAIL and the block continues.

const RUN = Boolean(process.env.CAPTURE_SHOTS);
const OUT = "docs/images/guide";
const PASSWORD = process.env.DEMO_PASSWORD ?? "Demo-Cecodes-2026!";
const VW = 1440;
const VH = 900;

test.use({ storageState: { cookies: [], origins: [] } });
test.describe.configure({ mode: "serial", timeout: 300_000 });

type Box = { x: number; y: number; width: number; height: number };

test.beforeEach(async ({ page }) => {
  test.skip(!RUN, "set CAPTURE_SHOTS=1 to run");
  mkdirSync(OUT, { recursive: true });
  await page.setViewportSize({ width: VW, height: VH });
});

test.afterAll(() => {
  console.log(`\nCAPTURE SUMMARY: ${okCount} ok, ${failCount} failed`);
});

let okCount = 0;
let failCount = 0;

async function login(page: Page, email: string) {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', PASSWORD);
  await page.getByRole("button", { name: /ingresar/i }).click();
  await page.waitForURL(/\/(dashboard|onboarding|admin)/, { waitUntil: "domcontentloaded" }).catch(() => {});
  await page.waitForLoadState("networkidle").catch(() => {});
}

async function settle(page: Page, ms = 900) {
  await page.waitForTimeout(ms); // let charts, popovers and RSC settle
}

async function boxesOf(locators: Locator[]): Promise<Box[]> {
  if (locators[0]) await locators[0].scrollIntoViewIfNeeded().catch(() => {});
  const out: Box[] = [];
  for (const l of locators) {
    const b = await l.boundingBox().catch(() => null);
    if (b) out.push(b);
  }
  return out;
}

function unionBox(boxes: Box[]): Box | null {
  if (boxes.length === 0) return null;
  const x1 = Math.min(...boxes.map((b) => b.x));
  const y1 = Math.min(...boxes.map((b) => b.y));
  const x2 = Math.max(...boxes.map((b) => b.x + b.width));
  const y2 = Math.max(...boxes.map((b) => b.y + b.height));
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

function clampClip(box: Box, pad = 26): Box {
  const x1 = Math.max(0, box.x - pad);
  const y1 = Math.max(0, box.y - pad);
  const x2 = Math.min(VW, box.x + box.width + pad);
  const y2 = Math.min(VH, box.y + box.height + pad);
  return { x: x1, y: y1, width: Math.max(1, x2 - x1), height: Math.max(1, y2 - y1) };
}

async function drawOverlays(page: Page, boxes: Box[]) {
  await page.evaluate((rects) => {
    for (const r of rects) {
      const d = document.createElement("div");
      d.setAttribute("data-guide-hl", "");
      Object.assign(d.style, {
        position: "fixed",
        left: `${r.x - 4}px`,
        top: `${r.y - 4}px`,
        width: `${r.width + 8}px`,
        height: `${r.height + 8}px`,
        border: "3px solid #e11d48",
        borderRadius: "10px",
        boxShadow: "0 0 0 4px rgba(225,29,72,0.22)",
        background: "rgba(225,29,72,0.06)",
        zIndex: "2147483647",
        pointerEvents: "none",
      });
      document.body.appendChild(d);
    }
  }, boxes);
}

async function clearOverlays(page: Page) {
  await page.evaluate(() => {
    document.querySelectorAll("[data-guide-hl]").forEach((e) => e.remove());
  });
}

async function shotClip(page: Page, name: string, clip: Box) {
  await page.screenshot({ path: `${OUT}/${name}.png`, clip });
  okCount += 1;
  console.log(`  ok   ${name}.png`);
}

// Highlight one or more controls and screenshot a focused region around them. `clipRect` overrides
// the region (e.g. the whole top bar) while the overlays still point at the specific controls.
async function focus(
  page: Page,
  name: string,
  highlight: Locator[],
  opts: { pad?: number; clipRect?: Box } = {},
) {
  try {
    await settle(page, 400);
    const boxes = await boxesOf(highlight);
    if (boxes.length === 0) throw new Error("no highlight target visible");
    await drawOverlays(page, boxes);
    const clip = opts.clipRect ? clampClip(opts.clipRect, 0) : clampClip(unionBox(boxes)!, opts.pad ?? 26);
    await shotClip(page, name, clip);
    await clearOverlays(page);
  } catch (e) {
    await clearOverlays(page).catch(() => {});
    failCount += 1;
    console.log(`  FAIL ${name}: ${(e as Error).message.split("\n")[0]}`);
  }
}

// Focused region around a set of locators, no highlight box (for popovers, dialogs, panels that are
// themselves the subject).
async function region(page: Page, name: string, locators: Locator[], pad = 18) {
  try {
    await settle(page, 400);
    const u = unionBox(await boxesOf(locators));
    if (!u) throw new Error("no region target visible");
    await shotClip(page, name, clampClip(u, pad));
  } catch (e) {
    failCount += 1;
    console.log(`  FAIL ${name}: ${(e as Error).message.split("\n")[0]}`);
  }
}

// Fixed-size clip whose top-left is offset from an anchor. For popovers whose wrapper is hard to
// select but whose corner is anchored on a known element.
async function around(page: Page, name: string, anchor: Locator, dim: { left?: number; up?: number; width: number; height: number }) {
  try {
    await settle(page, 350);
    const b = await anchor.first().boundingBox();
    if (!b) throw new Error("anchor not visible");
    const x = Math.max(0, b.x - (dim.left ?? 0));
    const y = Math.max(0, b.y - (dim.up ?? 0));
    await shotClip(page, name, { x, y, width: Math.min(dim.width, VW - x), height: Math.min(dim.height, VH - y) });
  } catch (e) {
    failCount += 1;
    console.log(`  FAIL ${name}: ${(e as Error).message.split("\n")[0]}`);
  }
}

async function full(page: Page, name: string) {
  try {
    await settle(page);
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
    okCount += 1;
    console.log(`  ok   ${name}.png (full)`);
  } catch (e) {
    failCount += 1;
    console.log(`  FAIL ${name}: ${(e as Error).message.split("\n")[0]}`);
  }
}

// ---------------------------------------------------------------------------- sign in (signed out)
test("guide: sign in", async ({ page }) => {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  await region(page, "signin", [page.getByRole("button", { name: /ingresar/i })], 330);
  await focus(page, "signin-button", [page.getByRole("button", { name: /ingresar/i })], {
    clipRect: { x: VW / 2, y: 0, width: VW / 2, height: VH },
  });
  await focus(page, "signin-no-register", [page.getByRole("link", { name: /Regístrate/i })], { pad: 70 });
});

// ------------------------------------------------------------------------ demo1: dashboard + shell
test("guide: demo1 dashboard and shell", async ({ page }) => {
  await login(page, "demo1@demo.cecodes.invalid");
  await full(page, "overview-dashboard");

  const dataEntryLink = page.getByRole("link", { name: "Ingreso de datos" });
  await focus(page, "sidebar", [dataEntryLink], { clipRect: { x: 0, y: 0, width: 300, height: VH } });
  await focus(page, "sidebar-data-entry", [dataEntryLink], { pad: 16 });
  await focus(
    page,
    "topbar",
    [
      page.getByRole("button", { name: "Cambiar tema" }),
      page.getByRole("button", { name: /^(ES|EN)$/ }).first(),
      page.getByRole("button", { name: "Cuenta" }),
    ],
    { clipRect: { x: VW - 400, y: 0, width: 400, height: 74 } },
  );
});

// ------------------------------------------------------------------------------ demo1: data entry
test("guide: demo1 data entry", async ({ page }) => {
  await login(page, "demo1@demo.cecodes.invalid");
  await page.goto("/data-entry", { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  await settle(page);

  await focus(page, "context-bar", [page.locator("#context-facility"), page.locator("#context-year")], { pad: 30 });
  await focus(
    page,
    "scope-tabs",
    [page.getByRole("tab", { name: /Alcance 1/ }), page.getByRole("tab", { name: /Alcance 2/ }), page.getByRole("tab", { name: /Alcance 3/ })],
    { pad: 16 },
  );

  const dieselInput = page.locator('input[aria-label*="Diésel o ACPM (B2) - Fijo"]');
  await dieselInput.scrollIntoViewIfNeeded().catch(() => {});
  const dieselRow = dieselInput.locator('xpath=ancestor::div[contains(@class,"md:grid-cols")][1]');
  // The worked example: the annual value box AND its on-row estimate in one picture.
  try {
    const rowBox = await dieselRow.boundingBox();
    if (rowBox) {
      await focus(page, "annual-value", [dieselInput], {
        clipRect: { x: rowBox.x - 14, y: rowBox.y - 14, width: rowBox.width + 28, height: rowBox.height + 28 },
      });
    } else {
      await focus(page, "annual-value", [dieselInput], { pad: 60 });
    }
  } catch {
    await focus(page, "annual-value", [dieselInput], { pad: 60 });
  }
  await focus(page, "number-hint", [page.getByText(/Solo valores no negativos/).first()], { pad: 16 });

  // The live-estimate popover for the diesel source.
  try {
    await dieselRow.getByRole("button", { name: /Emisiones estimadas/ }).click({ timeout: 8000 });
    await page.getByText("Factor aplicado").waitFor({ timeout: 8000 });
    await region(page, "live-estimate", [page.locator('[aria-label="Resumen del elemento"]')], 12);
    await page.keyboard.press("Escape");
  } catch (e) {
    failCount += 1;
    console.log(`  FAIL live-estimate: ${(e as Error).message.split("\n")[0]}`);
    await page.keyboard.press("Escape").catch(() => {});
  }

  await focus(page, "meta", [page.locator("#meta-SCOPE_1"), page.getByRole("button", { name: "Guardar meta" }).first()], { pad: 22 });

  // An empty category: the "¿Aplica?" switch and the "Agregar fuente" button.
  try {
    const emptySwitch = page.locator('[role="switch"][aria-label^="¿Aplica la categoría"]').first();
    await emptySwitch.scrollIntoViewIfNeeded();
    const emptyRow = emptySwitch.locator("xpath=ancestor::section[1]");
    await focus(page, "category-applies", [emptySwitch], { pad: 46 });
    const addBtn = emptyRow.getByRole("button", { name: "Agregar fuente" });
    await focus(page, "add-source-button", [addBtn], { pad: 22 });
    await addBtn.click({ timeout: 8000 });
    const search = page.getByPlaceholder("Buscar elemento...");
    await search.waitFor({ timeout: 8000 });
    await around(page, "add-source-search", search, { left: 12, up: 12, width: 480, height: 400 });
    await page.keyboard.press("Escape");
  } catch (e) {
    failCount += 1;
    console.log(`  FAIL category/add-source: ${(e as Error).message.split("\n")[0]}`);
    await page.keyboard.press("Escape").catch(() => {});
  }

  // The create-year dialog (demo1 already has years, so the button is in the context bar).
  try {
    await page.getByRole("button", { name: "Crear año" }).first().click({ timeout: 8000 });
    const yearInput = page.getByRole("dialog").getByLabel("Año", { exact: true });
    await yearInput.waitFor({ timeout: 8000 });
    await yearInput.fill("2024");
    await page.getByText(/Se usará el conjunto de PCG/).waitFor({ timeout: 5000 }).catch(() => {});
    await region(page, "create-year-dialog", [page.getByRole("dialog")], 10);
    await page.keyboard.press("Escape");
  } catch (e) {
    failCount += 1;
    console.log(`  FAIL create-year-dialog: ${(e as Error).message.split("\n")[0]}`);
    await page.keyboard.press("Escape").catch(() => {});
  }

  // Alcance 2: the twelve months.
  await page.getByRole("tab", { name: /Alcance 2/ }).click().catch(() => {});
  await settle(page, 900);
  const enero = page.locator('input[aria-label^="Enero"]').first();
  const badge = page.getByText(/\d+ de 12 meses/).first();
  const copy = page.getByRole("button", { name: /Copiar Enero a los meses vacíos/ }).first();
  await enero.scrollIntoViewIfNeeded().catch(() => {});
  await region(page, "scope2-months", [badge, enero, copy], 24);
  await focus(page, "copy-january", [copy], { pad: 26 });

  // A real edit through the tool: the "Guardado" pill + audit rows for Historial.
  try {
    await page.getByRole("tab", { name: /Alcance 1/ }).click();
    await settle(page, 700);
    await dieselInput.scrollIntoViewIfNeeded();
    await dieselInput.fill("14957.11");
    await dieselInput.blur();
    const savedPill = page.getByText(/Guardado \d/).first();
    await savedPill.waitFor({ timeout: 15000 });
    await focus(page, "autosave", [savedPill], { pad: 22 });
    await dieselInput.fill("14957.10");
    await dieselInput.blur();
    await page.getByText(/Guardado \d/).first().waitFor({ timeout: 15000 });
    await settle(page, 700);
  } catch (e) {
    failCount += 1;
    console.log(`  FAIL autosave/edit: ${(e as Error).message.split("\n")[0]}`);
  }
});

// ---------------------------------------------------------------------- demo1: resumen and company
test("guide: demo1 resumen and company", async ({ page }) => {
  await login(page, "demo1@demo.cecodes.invalid");
  await page.goto("/preview", { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  await full(page, "resumen");
  await region(page, "resumen-totals", [page.getByText("Total estimado"), page.getByText("Alcance 3").first()], 16);
  await focus(
    page,
    "resumen-exports",
    [page.getByRole("button", { name: "Descargar PDF" }), page.getByRole("button", { name: "Exportar a Excel" }), page.getByRole("button", { name: "CSV" })],
    { pad: 20 },
  );
  await region(page, "resumen-historial", [page.getByText("Historial de cambios"), page.getByText(/por demo1@/).first()], 14);

  await page.goto("/company", { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  await settle(page);
  await region(page, "company-profile", [page.getByText("Información de la empresa"), page.getByRole("button", { name: "Guardar cambios" })], 16);
  await region(page, "company-sedes", [page.getByRole("heading", { name: "Sedes" }), page.getByRole("button", { name: "Ingresar datos" }).first()], 16);
});

// ------------------------------------------------------------------------------- demo2: empty state
test("guide: demo2 empty first-time state", async ({ page }) => {
  await login(page, "demo2@demo.cecodes.invalid");
  await full(page, "first-dashboard");
  await page.goto("/data-entry", { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  await settle(page);
  await region(page, "create-year-empty", [page.getByText("Aún no hay años de reporte"), page.getByRole("button", { name: "Crear año" }).first()], 26);
});

// -------------------------------------------------------------------------- demo3: missing grid factor
test("guide: demo3 missing grid factor", async ({ page }) => {
  await login(page, "demo3@demo.cecodes.invalid");
  await page.goto("/data-entry", { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.getByRole("tab", { name: /Alcance 2/ }).click().catch(() => {});
  await settle(page, 900);
  await region(page, "missing-grid", [page.getByText(/Todavía no hay factor de red eléctrica/).first()], 28);
});

// ---------------------------------------------------------------------- demo4 + demo5: deactivated
test("guide: demo4 and demo5 deactivated", async ({ page }) => {
  await login(page, "demo4@demo.cecodes.invalid");
  await settle(page);
  await region(page, "company-deactivated", [page.getByText("Empresa desactivada"), page.getByText(/Sus datos se conservan/)], 34);

  await page.context().clearCookies();
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.fill('input[name="email"]', "demo5@demo.cecodes.invalid");
  await page.fill('input[name="password"]', PASSWORD);
  await page.getByRole("button", { name: /ingresar/i }).click();
  await page.getByText(/Tu cuenta fue desactivada/).waitFor({ timeout: 10000 }).catch(() => {});
  await region(page, "account-deactivated", [page.getByRole("button", { name: /ingresar/i })], 320);

  expect(okCount).toBeGreaterThan(0);
});
