import { expect, test, type Page } from "@playwright/test";
import { E2E_YEAR, db, loadFixture, type Fixture } from "./fixture";

// Traceability: entering a value writes an audit row (who / what / from-to / when), and the
// Resumen change log shows it. Proves the ActivityEntryChange trail end to end over HTTP.

test.describe.configure({ mode: "serial" });

let fixture: Fixture;

function category(page: Page, name: string | RegExp) {
  return page.locator("section").filter({ has: page.getByRole("heading", { name }) });
}

test.beforeAll(async () => {
  fixture = loadFixture();
  const client = await db();
  // Own the year and start from a clean audit log so the assertions are deterministic.
  await client.query(
    `INSERT INTO reporting_years (id, "facilityId", "companyId", year, "gwpSet", "createdAt", "updatedAt")
     VALUES (gen_random_uuid()::text, $1, $2, $3, 'AR6', now(), now())
     ON CONFLICT ("facilityId", year) DO NOTHING`,
    [fixture.facilityId, fixture.companyId, E2E_YEAR],
  );
  await client.query(
    `DELETE FROM activity_entries WHERE "reportingYearId" IN
       (SELECT id FROM reporting_years WHERE "facilityId" = $1 AND year = $2)`,
    [fixture.facilityId, E2E_YEAR],
  );
  await client.end();
});

test.afterAll(async () => {
  const client = await db();
  await client.query(`DELETE FROM reporting_years WHERE "facilityId" = $1 AND year = $2`, [
    fixture.facilityId,
    E2E_YEAR,
  ]);
  await client.end();
});

test.describe("data-entry audit trail", () => {
  let element = "";

  test("entering a value records who did it", async ({ page }) => {
    await page.goto(`/data-entry?facilityId=${fixture.facilityId}&year=${E2E_YEAR}`);
    await page.getByRole("tab", { name: "Alcance 1" }).click();

    const stationary = category(page, /^Fuentes Fijas$/);
    await stationary.getByRole("button", { name: /agregar fuente/i }).click();
    const option = page.getByRole("option").first();
    await expect(option).toBeVisible();
    element = (await option.locator("span").first().innerText()).trim();
    await option.click();

    const annual = page.getByLabel(
      new RegExp(`valor anual: ${element.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i"),
    );
    await annual.fill("777.5");
    await annual.blur();
    await expect(page.getByText(/^Guardado \d{1,2}:\d{2}/)).toBeVisible({ timeout: 15_000 });
  });

  test("the Resumen change log shows the entry, its value, and the actor", async ({ page }) => {
    await page.goto(`/preview?facilityId=${fixture.facilityId}&year=${E2E_YEAR}`);

    await expect(page.getByText(/historial de cambios/i)).toBeVisible({ timeout: 15_000 });
    // The row: "Valor ingresado" for the element, its new value, and who did it. The change log
    // shows the raw stored value (777.5), distinct from the comma-formatted table cell (777,5).
    const entry = page.getByRole("listitem").filter({ hasText: /valor ingresado/i }).first();
    await expect(entry).toBeVisible();
    await expect(entry).toContainText("777.5");
    await expect(entry).toContainText(fixture.email);
  });
});
