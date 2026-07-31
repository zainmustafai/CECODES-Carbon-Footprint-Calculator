import { expect, test } from "@playwright/test";
import { E2E_YEAR, db, loadFixture, type Fixture } from "./fixture";

// The Reports page: a real nav destination since the "Pronto" badge died. It reuses the
// preview's filter resolution, so one seeded year plus one (unpriced) entry is enough to
// light up the three download buttons. The export API's authorization is covered in
// cross-tenant.spec.ts; this spec only proves the page itself works.

let fixture: Fixture;
const ELEMENT = "E2E Fuente Reportes";

test.beforeAll(async () => {
  fixture = loadFixture();
  const client = await db();
  await client.query(
    `INSERT INTO reporting_years (id, "facilityId", "companyId", year, "gwpSet", "createdAt", "updatedAt")
     VALUES (gen_random_uuid()::text, $1, $2, $3, 'AR6'::"GwpSet", now(), now())
     ON CONFLICT ("facilityId", year) DO NOTHING`,
    [fixture.facilityId, fixture.companyId, E2E_YEAR],
  );
  const yearRow = await client.query<{ id: string }>(
    `SELECT id FROM reporting_years WHERE "facilityId" = $1 AND year = $2`,
    [fixture.facilityId, E2E_YEAR],
  );
  await client.query(
    `INSERT INTO activity_entries
       (id, "reportingYearId", "companyId", scope, category, element, unit, value, "createdAt", "updatedAt")
     VALUES (gen_random_uuid()::text, $1, $2, 'SCOPE_1'::"Scope", 'E2E Categoria', $3, 'gal', 10, now(), now())
     ON CONFLICT DO NOTHING`,
    [yearRow.rows[0].id, fixture.companyId, ELEMENT],
  );
  await client.end();
});

test.afterAll(async () => {
  const client = await db();
  // Deleting the year cascades the seeded entry, leaving the fixture facility clean for the
  // data-entry spec.
  await client.query(`DELETE FROM reporting_years WHERE "facilityId" = $1 AND year = $2`, [
    fixture.facilityId,
    E2E_YEAR,
  ]);
  await client.end();
});

test.describe("reports page", () => {
  test("the sidebar link opens the Reports page", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByRole("link", { name: /^reportes$/i }).click();
    await page.waitForURL("**/reports**");
    await expect(page.getByRole("heading", { name: /^reportes$/i })).toBeVisible();
  });

  test("a sede and year with data offer the three downloads", async ({ page }) => {
    await page.goto(`/reports?facilityId=${fixture.facilityId}&year=${E2E_YEAR}`);

    await expect(page.getByRole("button", { name: /descargar pdf/i })).toBeEnabled();
    await expect(page.getByRole("button", { name: /exportar a excel/i })).toBeEnabled();
    await expect(page.getByRole("button", { name: /^csv$/i })).toBeEnabled();
  });
});
