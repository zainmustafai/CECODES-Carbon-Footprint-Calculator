import { expect, test } from "@playwright/test";
import { E2E_YEAR, db, loadFixture, type Fixture } from "./fixture";

// The company-wide reduction target (Meta): a percentage typed with a Colombian comma is saved
// on the Empresa screen, persists across a reload as the normalized value, then clearing it
// removes the target. It replaced an earlier per-Sede/per-Alcance tonnes design the client never
// actually asked for (see CLIENT_DECISION_MEMO_ROUND3.md).

let fixture: Fixture;

test.beforeAll(async () => {
  fixture = loadFixture();
  // The target needs at least one reporting year to use as a baseline. E2E_YEAR normally
  // already exists (the data-entry spec creates it); ensure it so this spec stands on its own.
  const client = await db();
  await client.query(
    `INSERT INTO reporting_years (id, "facilityId", "companyId", year, "gwpSet", "createdAt", "updatedAt")
     VALUES (gen_random_uuid()::text, $1, $2, $3, 'AR6'::"GwpSet", now(), now())
     ON CONFLICT ("facilityId", year) DO NOTHING`,
    [fixture.facilityId, fixture.companyId, E2E_YEAR],
  );
  await client.end();
});

test("saves a comma-decimal reduction target, persists it, then clears it", async ({ page }) => {
  await page.goto("/company");

  const target = page.getByLabel(/^reducir$/i);
  await expect(target).toBeVisible();

  await target.fill("5,5");
  await page.getByRole("button", { name: /guardar meta/i }).click();
  await expect(page.getByText(/meta guardada/i)).toBeVisible({ timeout: 15_000 });

  // Stored as Decimal, so the reload shows the normalized "5.5".
  await page.reload();
  await expect(page.getByLabel(/^reducir$/i)).toHaveValue(/^5[.,]5$/);

  // Clearing the field deletes the target (an empty target is not a target of zero).
  const target2 = page.getByLabel(/^reducir$/i);
  await target2.fill("");
  await page.getByRole("button", { name: /guardar meta/i }).click();
  await expect(page.getByText(/meta eliminada/i)).toBeVisible({ timeout: 15_000 });

  await page.reload();
  await expect(page.getByLabel(/^reducir$/i)).toHaveValue("");
});

test("shows the target's progress on the Tablero once set", async ({ page }) => {
  await page.goto("/company");

  await page.getByLabel(/^reducir$/i).fill("5");
  await page.getByRole("button", { name: /guardar meta/i }).click();
  await expect(page.getByText(/meta guardada/i)).toBeVisible({ timeout: 15_000 });

  await page.goto(`/dashboard?year=${E2E_YEAR}`);
  await expect(page.getByText(/avance hacia la meta/i)).toBeVisible();
  // Either the baseline-year note or a percentage renders, depending on whether E2E_YEAR is
  // this fixture company's first reported year at the time this spec runs.
  await expect(
    page.getByText(/es tu año base|meta: reducir 5%/i).first(),
  ).toBeVisible({ timeout: 15_000 });

  // Clean up so later specs (and re-runs of this one) start from "no target".
  await page.goto("/company");
  await page.getByLabel(/^reducir$/i).fill("");
  await page.getByRole("button", { name: /guardar meta/i }).click();
  await expect(page.getByText(/meta eliminada/i)).toBeVisible({ timeout: 15_000 });
});
