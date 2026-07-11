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

function category(page: Page, name: string | RegExp) {
  return page.locator("section").filter({ has: page.getByRole("button", { name }) });
}

// The element names come from the live factor library, which prisma/import-factors.ts
// replaces wholesale with CECODES's dataset. Hardcoding one would tie the suite to whichever
// starter row happened to be seeded, so the first offered option is used instead.
async function addFirstSource(page: Page, section: ReturnType<typeof category>) {
  await section.getByRole("button", { name: /agregar fuente/i }).click();
  const option = page.getByRole("option").first();
  await expect(option).toBeVisible();
  const element = (await option.textContent())?.trim() ?? "";
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

    // Alcance 1: a single annual value.
    await page.getByRole("tab", { name: "Alcance 1" }).click();
    const stationary = category(page, /^Fuentes Fijas$/);
    await stationary.getByRole("button", { name: /^Fuentes Fijas$/ }).click();
    annualElement = await addFirstSource(page, stationary);

    const annual = page.getByLabel(new RegExp(`valor anual: ${escapeRegExp(annualElement)}`, "i"));
    await annual.fill("1234.56");
    await annual.blur();
    await expect(page.getByText(SAVED)).toBeVisible({ timeout: 15_000 });

    // The estimated-emissions summary appears as soon as a value exists.
    await expect(stationary.getByText(/emisiones estimadas/i).first()).toBeVisible();

    // Alcance 2: the twelve-month grid, then copy Enero across.
    await page.getByRole("tab", { name: "Alcance 2" }).click();
    const electricity = category(page, /^Consumo de energía eléctrica$/);
    await electricity.getByRole("button", { name: /^Consumo de energía eléctrica$/ }).click();
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

    await page.getByRole("button", { name: /copiar enero a todos los meses/i }).click();
    await expect(page.getByText("12 de 12 meses")).toBeVisible({ timeout: 15_000 });

    // The reload is the point of this test: it proves the Decimal round trip.
    await page.reload();

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
    const response = await page.goto("/admin/companies");
    expect(response?.status()).toBe(404);
  });
});

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
