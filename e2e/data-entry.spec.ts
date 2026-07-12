import { expect, test, type Page } from "@playwright/test";
import { E2E_YEAR, db, loadFixture, type Fixture } from "./fixture";

let fixture: Fixture;

// This spec asserts the "no reporting years yet" empty state, so it owns that precondition
// rather than inheriting it from whichever spec happened to run before it. Other specs create
// and remove years on the same fixture facility, and depending on Playwright's file ordering
// to undo that is the kind of coupling that fails once, mysteriously, on a Tuesday.
test.beforeAll(async () => {
  fixture = loadFixture();

  const client = await db();
  await client.query(`DELETE FROM reporting_years WHERE "facilityId" = $1`, [
    fixture.facilityId,
  ]);
  await client.end();
});

// Anchored on the timestamp: the idle label must never satisfy "a save has landed".
const SAVED = /^Guardado \d{1,2}:\d{2}/;

// Located by its heading, not by a button: a category with no sources renders as a single line
// (an h2, the ¿Aplica? switch and "Agregar fuente"), and only a category holding data becomes a
// collapsible card whose h2 wraps a trigger button. The heading is the one thing both states
// share.
function category(page: Page, name: string | RegExp) {
  return page.locator("section").filter({ has: page.getByRole("heading", { name }) });
}

// The element names come from the live factor library, which prisma/import-factors.ts
// replaces wholesale with CECODES's dataset. Hardcoding one would tie the suite to whichever
// starter row happened to be seeded, so the first offered option is used instead.
//
// The option renders the element name, then a unit span. Reading textContent would glue them
// ("Acetileno - Fijokg") and never match the field's "Valor anual: Acetileno - Fijo (kg)"
// aria-label, so take just the first span, which is the element name.
async function addFirstSource(page: Page, section: ReturnType<typeof category>) {
  await section.getByRole("button", { name: /agregar fuente/i }).click();
  const option = page.getByRole("option").first();
  await expect(option).toBeVisible();
  const element = (await option.locator("span").first().innerText()).trim();
  await option.click();
  return element;
}

test.describe.configure({ mode: "serial" });

test.describe("data entry", () => {
  let annualElement = "";

  test("creates a reporting year, then records annual and monthly values that survive a reload", async ({
    page,
  }) => {
    await page.goto("/data-entry");

    // The fixture company has a facility but no reporting year yet.
    await expect(page.getByText(/aún no hay años de reporte/i)).toBeVisible();
    await page.getByRole("button", { name: /crear año/i }).click();

    const dialog = page.getByRole("dialog");
    await dialog.getByLabel(/^año$/i).fill(String(E2E_YEAR));
    await dialog.getByRole("button", { name: /crear año/i }).click();

    await page.waitForURL(`**/data-entry?facilityId=${fixture.facilityId}&year=${E2E_YEAR}`);

    // Alcance 1: a single annual value. An empty category needs no expanding: it is one line and
    // "Agregar fuente" sits right on it.
    await page.getByRole("tab", { name: "Alcance 1" }).click();
    const stationary = category(page, /^Fuentes Fijas$/);
    annualElement = await addFirstSource(page, stationary);

    const annual = page.getByLabel(new RegExp(`valor anual: ${escapeRegExp(annualElement)}`, "i"));
    await annual.fill("1234.56");
    await annual.blur();
    await expect(page.getByText(SAVED)).toBeVisible({ timeout: 15_000 });

    // The estimated emissions are the disclosure trigger on the row: its accessible name is
    // "Emisiones estimadas: 1,23 t CO2e". Asserting the button proves both that the estimate
    // rendered and that the details behind it are reachable.
    await expect(
      stationary.getByRole("button", { name: /emisiones estimadas/i }).first(),
    ).toBeVisible();

    // Alcance 2: the twelve-month grid, then copy Enero across.
    await page.getByRole("tab", { name: "Alcance 2" }).click();
    const electricity = category(page, /^Consumo de energía eléctrica$/);
    await electricity.getByRole("button", { name: /agregar fuente/i }).click();
    await page.getByRole("option", { name: /Electricidad \(Red Nacional - SIN\)/ }).click();

    // exact, or this also matches the delete button's aria-label.
    await page
      .getByRole("button", { name: "Electricidad (Red Nacional - SIN)", exact: true })
      .click();
    const january = page.getByLabel(/^enero \(kWh\)$/i);
    await january.fill("102000");
    await january.blur();
    await expect(page.getByText(SAVED)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("1 de 12 meses")).toBeVisible();

    await page.getByRole("button", { name: /copiar enero/i }).click();
    await expect(page.getByText("12 de 12 meses")).toBeVisible({ timeout: 15_000 });

    // The reload is the point of this test: it proves the Decimal round trip. Wait for
    // domcontentloaded rather than the full load event: the assertions below wait for their
    // own elements, and the dev server's HMR socket can delay `load` on this heavy page.
    await page.reload({ waitUntil: "domcontentloaded" });

    await page.getByRole("tab", { name: "Alcance 1" }).click();
    await expect(
      page.getByLabel(new RegExp(`valor anual: ${escapeRegExp(annualElement)}`, "i")),
    ).toHaveValue("1234.56");

    await page.getByRole("tab", { name: "Alcance 2" }).click();
    await expect(page.getByText("12 de 12 meses")).toBeVisible();
  });

  test("rejects a negative value in the browser, before it can reach the database", async ({
    page,
  }) => {
    await page.goto(`/data-entry?facilityId=${fixture.facilityId}&year=${E2E_YEAR}`);
    await page.getByRole("tab", { name: "Alcance 1" }).click();

    const annual = page.getByLabel(
      new RegExp(`valor anual: ${escapeRegExp(annualElement)}`, "i"),
    );
    await annual.fill("-5");
    await annual.blur();

    await expect(annual).toHaveAttribute("aria-invalid", "true");
    // Nothing was sent, so the indicator never reports a failure.
    await expect(page.getByText(/no se pudo guardar/i)).toHaveCount(0);
  });
});

test.describe("authorization", () => {
  test("a company user cannot reach the admin area", async ({ page }) => {
    // Asserts the content, not the status code. requireAdmin() calls notFound() and the not-found
    // page is what renders, but the HTTP status is 200: the (app) layout has already streamed by
    // the time the page throws, so the response is committed before the 404 can be set. Nothing
    // admin is served either way. See e2e/cross-tenant.spec.ts, which owns this properly.
    await page.goto("/admin/companies");

    await expect(page.getByText(/página no encontrada/i)).toBeVisible();
    await expect(page.getByRole("heading", { name: /^empresas$/i })).toHaveCount(0);
  });
});

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
