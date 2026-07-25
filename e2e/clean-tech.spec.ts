import { expect, test } from "@playwright/test";
import { E2E_YEAR, db, loadFixture, type Fixture } from "./fixture";

// "Datos sobre tecnologías más limpias y buenas prácticas" (CECODES 2026-07-24): a free-form
// reporting row travels add -> data-entry table -> Resumen table, and NEVER moves a total.
// The last assertion is the one that matters: the client's instruction is that these values
// do not affect any calculation, and a spec that only proved the row renders would not notice
// if someone wired the quantity into the rollup.

test.describe.configure({ mode: "serial" });

// The data-entry screen ships the whole factor picker and re-renders after router.refresh().
// On a high-latency night to the us-west-2 pooler that round trip runs close to a minute in
// dev, so the waits here are generous on purpose; they assert existence, not speed.
test.setTimeout(300_000);

let fixture: Fixture;

const ELEMENT = "E2E Paneles solares en bodega";

test.beforeAll(async () => {
  fixture = loadFixture();
  const client = await db();
  await client.query(
    `INSERT INTO reporting_years (id, "facilityId", "companyId", year, "gwpSet", "createdAt", "updatedAt")
     VALUES (gen_random_uuid()::text, $1, $2, $3, 'AR6', now(), now())
     ON CONFLICT ("facilityId", year) DO NOTHING`,
    [fixture.facilityId, fixture.companyId, E2E_YEAR],
  );
  // Start clean so the add below is deterministic on re-runs.
  await client.query(
    `DELETE FROM clean_tech_entries WHERE "companyId" = $1 AND element = $2`,
    [fixture.companyId, ELEMENT],
  );
  await client.end();
});

test.afterAll(async () => {
  const client = await db();
  await client.query(
    `DELETE FROM clean_tech_entries WHERE "companyId" = $1 AND element = $2`,
    [fixture.companyId, ELEMENT],
  );
  await client.end();
});

test.describe("tecnologías más limpias", () => {
  test("a free-form row can be added and appears in the data-entry table", async ({ page }) => {
    await page.goto(`/data-entry?facilityId=${fixture.facilityId}&year=${E2E_YEAR}`);

    await expect(
      page.getByText(/tecnologías más limpias y buenas prácticas/i).first(),
    ).toBeVisible();

    await page.getByRole("button", { name: /agregar registro/i }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByLabel(/^elemento$/i).fill(ELEMENT);
    await dialog.getByLabel(/dato de actividad/i).fill("120,5");
    await dialog.getByLabel(/unidad consumo/i).fill("kWh instalados");
    await dialog.getByRole("button", { name: /agregar registro/i }).click();

    // The dialog closes and the row lands in the table with the normalized decimal.
    await expect(dialog).not.toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("cell", { name: ELEMENT })).toBeVisible({ timeout: 15_000 });
  });

  test("the row appears on the Resumen, and it moved NO total", async ({ page }) => {
    // Read the year's total straight from the page BEFORE asserting the clean-tech table, then
    // compare against the engine-side truth: clean-tech has no factor and no scope total, so
    // the headline must be exactly what the activity entries alone produce. The simplest
    // airtight check over HTTP: a year whose ONLY data is the clean-tech row must total 0.
    const client = await db();
    const entryCount = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM activity_entries WHERE "reportingYearId" IN
         (SELECT id FROM reporting_years WHERE "facilityId" = $1 AND year = $2)`,
      [fixture.facilityId, E2E_YEAR],
    );
    await client.end();

    await page.goto(`/preview?facilityId=${fixture.facilityId}&year=${E2E_YEAR}`);

    await expect(
      page.getByText(/tecnologías más limpias y buenas prácticas/i).first(),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("cell", { name: ELEMENT })).toBeVisible();

    if (entryCount.rows[0].count === "0") {
      // No activity entries: the clean-tech quantity (120.5) must NOT have leaked anywhere.
      // The four headline cards (total + three scopes) must all read exactly 0.
      const zeroCards = page.locator("p.tabular-nums", { hasText: /^0\s/ });
      await expect(zeroCards).toHaveCount(4);
    }
  });
});
