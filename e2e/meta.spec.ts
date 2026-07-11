import { expect, test } from "@playwright/test";
import { E2E_YEAR, db, loadFixture, type Fixture } from "./fixture";

// The per-scope reduction target (Meta): a decimal typed with a Colombian comma is saved,
// persists across a reload as the normalized value, then clearing it removes the target.

let fixture: Fixture;

test.beforeAll(async () => {
  fixture = loadFixture();
  // The Meta card needs an open reporting year. E2E_YEAR normally already exists (the
  // data-entry spec creates it); ensure it so this spec stands on its own.
  const client = await db();
  await client.query(
    `INSERT INTO reporting_years (id, "facilityId", "companyId", year, "gwpSet", "createdAt", "updatedAt")
     VALUES (gen_random_uuid()::text, $1, $2, $3, 'AR6'::"GwpSet", now(), now())
     ON CONFLICT ("facilityId", year) DO NOTHING`,
    [fixture.facilityId, fixture.companyId, E2E_YEAR],
  );
  await client.end();
});

test("saves a comma-decimal Meta, persists it, then clears it", async ({ page }) => {
  await page.goto(`/data-entry?facilityId=${fixture.facilityId}&year=${E2E_YEAR}`);

  // Alcance 1 is the default tab, so its Meta card is the one mounted.
  const meta = page.getByLabel(/meta para alcance 1/i);
  await expect(meta).toBeVisible();

  await meta.fill("140,5");
  await page.getByRole("button", { name: /guardar meta/i }).click();
  await expect(page.getByText(/meta guardada/i)).toBeVisible({ timeout: 15_000 });

  // Stored as Decimal, so the reload shows the normalized "140.5".
  await page.reload();
  await expect(page.getByLabel(/meta para alcance 1/i)).toHaveValue(/^140[.,]5$/);

  // Clearing the field deletes the target (an empty target is not a target of zero).
  const meta2 = page.getByLabel(/meta para alcance 1/i);
  await meta2.fill("");
  await page.getByRole("button", { name: /guardar meta/i }).click();
  await expect(page.getByText(/meta eliminada/i)).toBeVisible({ timeout: 15_000 });

  await page.reload();
  await expect(page.getByLabel(/meta para alcance 1/i)).toHaveValue("");
});
