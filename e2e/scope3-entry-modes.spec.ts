import { expect, test, type Page } from "@playwright/test";
import {
  ADMIN_STORAGE_STATE,
  E2E_SUBSIDY_YEAR,
  E2E_YEAR,
  db,
  loadFixture,
  type Fixture,
} from "./fixture";

// Client feedback 2026-08-15: Scope 3 Categoria 6 "Subsidios de transporte" is reported in COP,
// converted to gallons via a yearly reference price (TransportSubsidyPrice); Categoria 6/7
// distance categories (unit "pasajeros * km" / "vehiculo * km") are reported as a separate
// count and distance, multiplied. See EntryMode in prisma/schema.prisma and rollupYear's
// MONEY_PER_GALLON / COUNT_TIMES_DISTANCE branches in src/lib/calc/rollup.ts.

test.describe.configure({ mode: "serial" });
// See clean-tech.spec.ts: the data-entry screen ships the whole factor picker, and a cold
// Turbopack compile plus the Supabase pooler round trip can push a first navigation well past
// the 5s default on a slow night. Generous on purpose; these assert existence, not speed.
test.setTimeout(300_000);

function category(page: Page, name: string | RegExp) {
  return page.locator("section").filter({ has: page.getByRole("heading", { name }) });
}

// Anchored on the timestamp: the idle label must never satisfy "a save has landed" (see
// data-entry.spec.ts, which owns this pattern). The estimate popover reacts to local state the
// moment a field is typed, well before the debounced autosave confirms - reloading on that
// signal alone races the save and can reload a value that was never actually persisted.
const SAVED = /^Guardado \d{1,2}:\d{2}/;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const MONEY_ELEMENT = "C6: Gasolina E10 (Comercial) - Móvil";
const DISTANCE_ELEMENT = "C7: Carro particular";

test.describe("data entry: Scope 3 Categoria 6/7 entry modes", () => {
  let fixture: Fixture;
  // The money entered is derived FROM the year's real price so the expected gallons always
  // land on a clean, price-independent 24 - see the comment below.
  let moneyValueForTwentyFourGallons = "";

  test.beforeAll(async () => {
    fixture = loadFixture();
    const client = await db();

    // 2024 (E2E_YEAR) already carries the real, seeded TransportSubsidyPrice the demo company's
    // data correction relies on (prisma/fix-2026-08-15-scope3-entry-modes-demo-data.ts) - reading
    // it, never writing it, is the same convention fixture.ts already documents for the year's
    // real seeded grid electricity factor.
    // Since 2026-09-03 the table holds one row per FUEL per year, so this pins the gasoline row:
    // the demo company entry this spec drives is a gasoline subsidy.
    const priceRow = await client.query<{ pricePerGallonCop: string }>(
      `SELECT "pricePerGallonCop" FROM transport_subsidy_prices WHERE year = $1 AND fuel = $2`,
      [E2E_YEAR, "GASOLINE"],
    );
    if (priceRow.rows.length === 0) {
      throw new Error(
        `E2E requires a GASOLINE transport_subsidy_prices row for ${E2E_YEAR} (real seeded reference data); none found.`,
      );
    }
    // Money = price x 24, so money / price always derives exactly 24 gallons, whatever the
    // reference price currently is: the assertion below never depends on its value.
    moneyValueForTwentyFourGallons = String(Number(priceRow.rows[0].pricePerGallonCop) * 24);

    // Own the shared fixture year; other specs create it too (ON CONFLICT DO NOTHING).
    await client.query(
      `INSERT INTO reporting_years (id, "facilityId", "companyId", year, "gwpSet", "createdAt", "updatedAt")
       VALUES (gen_random_uuid()::text, $1, $2, $3, 'AR6', now(), now())
       ON CONFLICT ("facilityId", year) DO NOTHING`,
      [fixture.facilityId, fixture.companyId, E2E_YEAR],
    );
    // Start clean so adding these sources is deterministic on re-runs.
    await client.query(
      `DELETE FROM activity_entries WHERE "companyId" = $1 AND element = ANY($2::text[])`,
      [fixture.companyId, [MONEY_ELEMENT, DISTANCE_ELEMENT]],
    );
    await client.end();
  });

  test.afterAll(async () => {
    const client = await db();
    await client.query(
      `DELETE FROM activity_entries WHERE "companyId" = $1 AND element = ANY($2::text[])`,
      [fixture.companyId, [MONEY_ELEMENT, DISTANCE_ELEMENT]],
    );
    await client.end();
  });

  test("a MONEY_PER_GALLON source shows a COP unit and derives gallons correctly", async ({
    page,
  }) => {
    await page.goto(`/data-entry?facilityId=${fixture.facilityId}&year=${E2E_YEAR}&scope=SCOPE_3`);

    const c6 = category(page, /^C6: Viajes de negocios$/);
    await c6.getByRole("button", { name: /agregar fuente/i }).click();
    await page.getByPlaceholder(/buscar elemento/i).fill(MONEY_ELEMENT);
    await page
      .getByRole("option", { name: new RegExp(`^${escapeRegExp(MONEY_ELEMENT)}`) })
      .click();

    // The field's own accessible name carries the unit: COP, never the factor library's own
    // "gal" unit - the whole point of MONEY_PER_GALLON is that the company reports money.
    const value = page.getByLabel(
      new RegExp(`valor anual: ${escapeRegExp(MONEY_ELEMENT)} \\(COP\\)`, "i"),
    );
    await expect(value).toBeVisible({ timeout: 15_000 });
    await value.fill(moneyValueForTwentyFourGallons);
    await value.blur();
    await expect(page.getByText(SAVED)).toBeVisible({ timeout: 15_000 });

    const estimate = c6.getByRole("button", { name: /emisiones estimadas/i }).first();
    // A real computed number, not the "sin precio de subsidio" / "sin factor" fallback label.
    await expect(estimate).toHaveAccessibleName(/\d[.,]\d+ t CO2e/, { timeout: 15_000 });

    await estimate.click();
    await expect(page.getByText(/galones derivados/i)).toBeVisible();
    // The auditable intermediate step: money / that year's real price = exactly 24 gal.
    await expect(page.getByText("24 gal")).toBeVisible();
  });

  test("a COUNT_TIMES_DISTANCE source renders two fields and multiplies them", async ({
    page,
  }) => {
    await page.goto(`/data-entry?facilityId=${fixture.facilityId}&year=${E2E_YEAR}&scope=SCOPE_3`);

    const c7 = category(page, /^C7: Desplazamiento de colaboradores$/);
    await c7.getByRole("button", { name: /agregar fuente/i }).click();
    // The full "C7:" prefix disambiguates from the library's unprefixed "Carro particular" row
    // in the very same subcategory.
    await page.getByPlaceholder(/buscar elemento/i).fill(DISTANCE_ELEMENT);
    await page
      .getByRole("option", { name: new RegExp(`^${escapeRegExp(DISTANCE_ELEMENT)}`) })
      .click();

    // TWO separate fields, count and distance - never one pre-multiplied cell.
    const count = page.getByLabel(new RegExp(`cantidad: ${escapeRegExp(DISTANCE_ELEMENT)}`, "i"));
    const distance = page.getByLabel(
      new RegExp(`distancia: ${escapeRegExp(DISTANCE_ELEMENT)}`, "i"),
    );
    await expect(count).toBeVisible({ timeout: 15_000 });
    await expect(distance).toBeVisible();

    // Fill both before blurring either: the store marks both dirty on keystroke regardless of
    // the autosave debounce, so the blur below flushes them as ONE batch. That also sidesteps a
    // real trap with the SAVED text: two separate flushes seconds apart can both land inside the
    // same clock minute, so a second "Guardado HH:MM" wait can pass on the FIRST flush's text
    // without the second one having landed yet, and this reload assertion goes on to prove it.
    await count.fill("3");
    await distance.fill("1200");
    await distance.blur();
    await expect(page.getByText(SAVED)).toBeVisible({ timeout: 15_000 });

    const estimate = c7.getByRole("button", { name: /emisiones estimadas/i }).first();
    await expect(estimate).toHaveAccessibleName(/\d[.,]\d+ t CO2e/, { timeout: 15_000 });

    // The reload proves the Decimal round trip on BOTH columns: value (count) AND the new
    // secondaryValue (distance), the whole reason this column exists (client feedback 2026-08-15).
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByRole("tab", { name: "Alcance 3" }).click();
    await expect(
      page.getByLabel(new RegExp(`cantidad: ${escapeRegExp(DISTANCE_ELEMENT)}`, "i")),
    ).toHaveValue("3");
    await expect(
      page.getByLabel(new RegExp(`distancia: ${escapeRegExp(DISTANCE_ELEMENT)}`, "i")),
    ).toHaveValue("1200");
  });
});

test.describe("admin: transport-subsidy price CRUD", () => {
  test.use({ storageState: ADMIN_STORAGE_STATE });

  test("adds, rejects a duplicate year, edits, and deletes a subsidy price", async ({ page }) => {
    await page.goto("/admin/factors?tab=subsidy");

    await page.getByRole("button", { name: /agregar precio/i }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel(/^año$/i).fill(String(E2E_SUBSIDY_YEAR));
    // Radix Select, not a native <select>: click the trigger, then the option (same idiom as
    // the sector and alcance pickers in admin-companies.spec.ts / admin-factors.spec.ts).
    await dialog.getByRole("combobox", { name: /combustible/i }).click();
    await page.getByRole("option", { name: "Gasolina" }).click();
    await dialog.getByLabel(/^precio$/i).fill("11000");
    // The "E2E" source prefix is what teardown sweeps this row by if this test crashes early.
    await dialog.getByLabel(/^fuente$/i).fill("E2E harness");
    await dialog.getByRole("button", { name: /guardar/i }).click();

    // exact: the actions cell carries the year in its button labels ("Editar: 2030",
    // "Eliminar: 2030"), so a non-exact name matches both that cell and the year cell.
    await expect(
      page.getByRole("cell", { name: String(E2E_SUBSIDY_YEAR), exact: true }),
    ).toBeVisible({ timeout: 15_000 });

    // Creating the same year again must be refused, not silently overwritten.
    await page.getByRole("button", { name: /agregar precio/i }).click();
    const duplicate = page.getByRole("dialog");
    await duplicate.getByLabel(/^año$/i).fill(String(E2E_SUBSIDY_YEAR));
    await duplicate.getByRole("combobox", { name: /combustible/i }).click();
    await page.getByRole("option", { name: "Gasolina" }).click();
    await duplicate.getByLabel(/^precio$/i).fill("12000");
    await duplicate.getByLabel(/^fuente$/i).fill("E2E harness duplicate");
    await duplicate.getByRole("button", { name: /guardar/i }).click();
    await expect(duplicate.getByText(/ya existe un precio para ese año y combustible/i)).toBeVisible({
      timeout: 15_000,
    });
    await page.keyboard.press("Escape");
    await expect(duplicate).toHaveCount(0);

    // Edit it: the year and the fuel stay read-only (together they are the key), the price changes.
    const row = page.getByRole("row", { name: new RegExp(String(E2E_SUBSIDY_YEAR)) });
    await row.getByRole("button", { name: /^editar/i }).click();
    const edit = page.getByRole("dialog");
    const price = edit.getByLabel(/^precio$/i);
    await expect(price).toHaveValue("11000", { timeout: 15_000 });
    await price.fill("13500");
    await edit.getByRole("button", { name: /guardar/i }).click();
    await expect(page.getByText(/precio de subsidio guardado/i)).toBeVisible({ timeout: 15_000 });

    // Reload for a stable read: the edit lands via a server action refresh, and reading straight
    // after can momentarily race the in-place re-render (same reasoning as the factor edit test).
    await page.reload();
    await expect(page.getByRole("cell", { name: "13500" })).toBeVisible({ timeout: 15_000 });

    // And remove it again, so the shared global reference table is left as we found it.
    await page
      .getByRole("row", { name: new RegExp(String(E2E_SUBSIDY_YEAR)) })
      .getByRole("button", { name: /^eliminar/i })
      .click();
    await page.getByRole("alertdialog").getByRole("button", { name: /eliminar/i }).click();

    await expect(
      page.getByRole("cell", { name: String(E2E_SUBSIDY_YEAR), exact: true }),
    ).toHaveCount(0, { timeout: 15_000 });
  });
});
