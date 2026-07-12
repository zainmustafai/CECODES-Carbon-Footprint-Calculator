import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { db, loadFixture, type Fixture } from "./fixture";

// Facility create/rename/delete, plus the year-guarded delete flow. The fixture facility is
// never touched: the has-years path runs on a second facility this spec owns, so the shared
// facility other specs depend on keeps its clean state.
//
// Sedes has no route of its own: it is the section beneath the profile on /company.

test.describe.configure({ mode: "serial" });

const suffix = randomUUID().slice(0, 8);
const nameA = `E2E Sede A ${suffix}`;
const nameARenamed = `E2E Sede A ${suffix} editada`;
const nameB = `E2E Sede B ${suffix}`;

let fixture: Fixture;

test.beforeAll(() => {
  fixture = loadFixture();
});

test.afterAll(async () => {
  // Defensive: a failed step could leave one of this spec's facilities behind, which would
  // change facilities[0] for a later spec.
  const client = await db();
  await client.query(`DELETE FROM facilities WHERE "companyId" = $1 AND name LIKE $2`, [
    fixture.companyId,
    `E2E Sede %${suffix}%`,
  ]);
  await client.end();
});

const card = (page: Page, name: string) =>
  page.locator('[data-slot="card"]').filter({ hasText: name });

test.describe("facilities", () => {
  test("creates, renames, and deletes a facility", async ({ page }) => {
    await page.goto("/company");

    // Create.
    await page.getByRole("button", { name: /agregar sede/i }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel(/^planta$/i).fill(nameA);
    await dialog.getByLabel(/ubicación/i).fill("Bogotá, Colombia");
    await dialog.getByRole("button", { name: /agregar sede/i }).click();

    await expect(page.getByText(/sede agregada/i)).toBeVisible({ timeout: 15_000 });
    await expect(card(page, nameA)).toBeVisible();

    // Rename.
    await page.getByRole("button", { name: `Editar: ${nameA}`, exact: true }).click();
    const editDialog = page.getByRole("dialog");
    await editDialog.getByLabel(/^planta$/i).fill(nameARenamed);
    await editDialog.getByRole("button", { name: /guardar cambios/i }).click();

    await expect(page.getByText(/sede actualizada/i)).toBeVisible({ timeout: 15_000 });
    await expect(card(page, nameARenamed)).toBeVisible();

    // Delete: the confirm dialog stays open while the delete is in flight, then the card goes.
    await page.getByRole("button", { name: `Eliminar: ${nameARenamed}`, exact: true }).click();
    const confirm = page.getByRole("alertdialog");
    await expect(confirm).toBeVisible();
    await confirm.getByRole("button", { name: /^eliminar$/i }).click();
    await expect(confirm).toBeVisible(); // still open during the server round trip

    await expect(page.getByText(/sede eliminada/i)).toBeVisible({ timeout: 15_000 });
    await expect(card(page, nameARenamed)).toHaveCount(0);
  });

  test("refuses to delete a facility with reporting years until the year is removed", async ({
    page,
  }) => {
    await page.goto("/company");

    // A second facility, used entirely within this test.
    await page.getByRole("button", { name: /agregar sede/i }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel(/^planta$/i).fill(nameB);
    await dialog.getByLabel(/ubicación/i).fill("Medellín, Colombia");
    await dialog.getByRole("button", { name: /agregar sede/i }).click();
    await expect(page.getByText(/sede agregada/i)).toBeVisible({ timeout: 15_000 });

    // Create a reporting year on it through the data-entry create-year dialog. 2023 is not
    // used by any other spec, so its year chip stays unambiguous on the facilities card.
    await card(page, nameB).getByRole("link", { name: /ingresar datos/i }).click();
    await page.waitForURL(/\/data-entry\?facilityId=/);
    await expect(page.getByText(/aún no hay años de reporte/i)).toBeVisible();
    await page.getByRole("button", { name: /crear año/i }).click();
    const yearDialog = page.getByRole("dialog");
    await yearDialog.getByLabel(/^año$/i).fill("2023");
    await yearDialog.getByRole("button", { name: /crear año/i }).click();
    await page.waitForURL(/[?&]year=2023/);

    // Deleting the facility is refused while a year exists.
    await page.goto("/company");
    await page.getByRole("button", { name: `Eliminar: ${nameB}`, exact: true }).click();
    const refuse = page.getByRole("alertdialog");
    await refuse.getByRole("button", { name: /^eliminar$/i }).click();
    await expect(
      page.getByText(/no puedes eliminar una sede con años de reporte/i),
    ).toBeVisible({ timeout: 15_000 });
    // The action failed, so the dialog is still open. Dismiss it.
    await refuse.getByRole("button", { name: /cancelar/i }).click();

    // Remove the year from its chip. With no activity records the confirmation names them
    // collectively ("todos los registros").
    await card(page, nameB).getByRole("button", { name: "Eliminar año 2023" }).click();
    const yearConfirm = page.getByRole("alertdialog");
    await expect(yearConfirm).toBeVisible();
    await expect(yearConfirm.getByText(/todos los registros/i)).toBeVisible();
    await yearConfirm.getByRole("button", { name: /eliminar año/i }).click();
    await expect(page.getByText(/año de reporte eliminado/i)).toBeVisible({ timeout: 15_000 });

    // Now the facility is deletable.
    await page.getByRole("button", { name: `Eliminar: ${nameB}`, exact: true }).click();
    const del = page.getByRole("alertdialog");
    await del.getByRole("button", { name: /^eliminar$/i }).click();
    await expect(page.getByText(/sede eliminada/i)).toBeVisible({ timeout: 15_000 });
    await expect(card(page, nameB)).toHaveCount(0);
  });
});
