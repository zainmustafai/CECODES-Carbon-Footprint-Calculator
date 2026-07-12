import { expect, test, type Page } from "@playwright/test";
import {
  E2E_YEAR,
  E2E_YEAR_WITHOUT_GRID_FACTOR,
  db,
  loadFixture,
  type Fixture,
} from "./fixture";

// Edge behaviour of the data-entry grid: applicability toggling, source-lock, browser-side
// value validation and the Scope 2 missing-grid-factor warning. Both reporting years are
// created and removed here so the fixture facility is left with no years, which is the state
// the data-entry spec asserts at its start.

test.describe.configure({ mode: "serial" });

let fixture: Fixture;
// The element chosen from the live factor library in the "add a source" step, reused by the
// value-validation and source-removal steps.
let element = "";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// See the note in data-entry.spec.ts: an empty category is a single line whose name is a plain
// h2, and only a category holding data wraps that h2 around a collapsible trigger button.
function category(page: Page, name: string | RegExp) {
  return page.locator("section").filter({ has: page.getByRole("heading", { name }) });
}

async function ensureYear(facilityId: string, companyId: string, year: number, gwp: string) {
  const client = await db();
  await client.query(
    `INSERT INTO reporting_years (id, "facilityId", "companyId", year, "gwpSet", "createdAt", "updatedAt")
     VALUES (gen_random_uuid()::text, $1, $2, $3, $4::"GwpSet", now(), now())
     ON CONFLICT ("facilityId", year) DO NOTHING`,
    [facilityId, companyId, year, gwp],
  );
  await client.end();
}

test.beforeAll(async () => {
  fixture = loadFixture();
  await ensureYear(fixture.facilityId, fixture.companyId, E2E_YEAR, "AR6");
  await ensureYear(fixture.facilityId, fixture.companyId, E2E_YEAR_WITHOUT_GRID_FACTOR, "AR5");
});

test.afterAll(async () => {
  const client = await db();
  await client.query(
    `DELETE FROM reporting_years WHERE "facilityId" = $1 AND year = ANY($2::int[])`,
    [fixture.facilityId, [E2E_YEAR, E2E_YEAR_WITHOUT_GRID_FACTOR]],
  );
  await client.end();
});

test.describe("data entry edge cases", () => {
  test("a category with no sources can be marked 'no aplica' and it survives a reload", async ({
    page,
  }) => {
    await page.goto(`/data-entry?facilityId=${fixture.facilityId}&year=${E2E_YEAR}`);
    await page.getByRole("tab", { name: "Alcance 1" }).click();

    // The category name is the heading. On an empty category the first button is "Agregar
    // fuente", not the name, so the heading is what identifies it.
    const firstSection = page.locator("section").first();
    const name = (await firstSection.getByRole("heading").first().innerText()).trim();
    expect(name).not.toBe("");

    const toggle = firstSection.getByRole("switch");
    await expect(toggle).toBeEnabled();
    await expect(toggle).toBeChecked();

    await toggle.click();
    await expect(page.getByText(/categoría marcada como no aplica/i)).toBeVisible({
      timeout: 15_000,
    });
    await expect(toggle).not.toBeChecked({ timeout: 15_000 });

    await page.reload();
    await page.getByRole("tab", { name: "Alcance 1" }).click();
    const reloaded = category(page, new RegExp(`^${escapeRegExp(name)}$`)).getByRole("switch");
    await expect(reloaded).not.toBeChecked();

    // Put it back so the category is left applicable.
    await reloaded.click();
    await expect(page.getByText(/categoría marcada como aplicable/i)).toBeVisible({
      timeout: 15_000,
    });
    await expect(reloaded).toBeChecked({ timeout: 15_000 });
  });

  test("adding a source locks the category's ¿Aplica? switch", async ({ page }) => {
    await page.goto(`/data-entry?facilityId=${fixture.facilityId}&year=${E2E_YEAR}`);
    await page.getByRole("tab", { name: "Alcance 1" }).click();

    const stationary = category(page, /^Fuentes Fijas$/);
    await stationary.getByRole("button", { name: /agregar fuente/i }).click();
    const option = page.getByRole("option").first();
    await expect(option).toBeVisible();
    element = (await option.textContent())?.trim() ?? "";
    await option.click();

    await expect(page.getByText(/fuente agregada/i)).toBeVisible({ timeout: 15_000 });
    // Locked by its sources: turning the category off would delete recorded consumption.
    await expect(stationary.getByRole("switch")).toBeDisabled({ timeout: 15_000 });
  });

  test("an invalid value sets aria-invalid and never survives a reload", async ({ page }) => {
    await page.goto(`/data-entry?facilityId=${fixture.facilityId}&year=${E2E_YEAR}`);
    await page.getByRole("tab", { name: "Alcance 1" }).click();

    const annual = page.getByLabel(new RegExp(`valor anual: ${escapeRegExp(element)}`, "i"));

    await annual.fill("abc");
    await expect(annual).toHaveAttribute("aria-invalid", "true");

    await annual.fill("-5");
    await expect(annual).toHaveAttribute("aria-invalid", "true");

    // Neither draft was ever marked dirty, so nothing reached the server.
    await page.reload();
    await page.getByRole("tab", { name: "Alcance 1" }).click();
    await expect(
      page.getByLabel(new RegExp(`valor anual: ${escapeRegExp(element)}`, "i")),
    ).toHaveValue("");
  });

  test("removing a source keeps the confirm open while pending, then returns focus", async ({
    page,
  }) => {
    await page.goto(`/data-entry?facilityId=${fixture.facilityId}&year=${E2E_YEAR}`);
    await page.getByRole("tab", { name: "Alcance 1" }).click();

    const stationary = category(page, /^Fuentes Fijas$/);
    const addSource = stationary.getByRole("button", { name: /agregar fuente/i });

    await stationary
      .getByRole("button", { name: new RegExp(`eliminar fuente: ${escapeRegExp(element)}`, "i") })
      .click();

    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: /^eliminar$/i }).click();
    await expect(dialog).toBeVisible(); // stays open while the delete is in flight

    await expect(page.getByText(/fuente eliminada/i)).toBeVisible({ timeout: 15_000 });
    await expect(
      stationary.getByRole("button", {
        name: new RegExp(`eliminar fuente: ${escapeRegExp(element)}`, "i"),
      }),
    ).toHaveCount(0);
    // Focus is handed back to the one element that survives the refresh.
    await expect(addSource).toBeFocused();
  });

  test("Scope 2 warns about a missing grid factor only for a year without one", async ({
    page,
  }) => {
    // 2020 has no national grid factor.
    await page.goto(
      `/data-entry?facilityId=${fixture.facilityId}&year=${E2E_YEAR_WITHOUT_GRID_FACTOR}`,
    );
    await page.getByRole("tab", { name: "Alcance 2" }).click();
    const warning = page
      .locator('[role="status"]')
      .filter({ hasText: /factor de red eléctrica para 2020/i });
    await expect(warning).toBeVisible();

    // 2024 has a seeded grid factor, so no warning is shown.
    await page.goto(`/data-entry?facilityId=${fixture.facilityId}&year=${E2E_YEAR}`);
    await page.getByRole("tab", { name: "Alcance 2" }).click();
    await expect(page.getByText(/factor de red eléctrica para 2024/i)).toHaveCount(0);
  });
});
