import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { ADMIN_STORAGE_STATE, loadFixture, type Fixture } from "./fixture";

// Admin CRUD over companies: create, edit sector, deactivate/activate, delete an empty
// company, and confirm that deleting a company that still has data is refused.

test.use({ storageState: ADMIN_STORAGE_STATE });
test.describe.configure({ mode: "serial" });

const suffix = randomUUID().slice(0, 8);
const companyName = `E2E Empresa ${suffix}`;

let fixture: Fixture;

test.beforeAll(() => {
  fixture = loadFixture();
});

const card = (page: Page, name: string) =>
  page.locator('[data-slot="card"]').filter({ hasText: name });

test.describe("admin companies", () => {
  test("creates a company", async ({ page }) => {
    await page.goto("/admin/companies");

    await page.getByRole("button", { name: /nueva empresa/i }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel(/nombre de la empresa/i).fill(companyName);
    await dialog.getByRole("combobox", { name: /sector/i }).click();
    await page.getByRole("option", { name: "Manufactura" }).click();
    await dialog.getByRole("button", { name: /^guardar$/i }).click();

    await expect(page.getByText(/empresa creada/i)).toBeVisible({ timeout: 15_000 });
    await expect(card(page, companyName)).toBeVisible();
    await expect(card(page, companyName)).toContainText(/manufactura/i);
  });

  test("edits its sector", async ({ page }) => {
    await page.goto("/admin/companies");

    await card(page, companyName).getByRole("button", { name: /acciones/i }).click();
    await page.getByRole("menuitem", { name: /editar/i }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("combobox", { name: /sector/i }).click();
    await page.getByRole("option", { name: "Energía" }).click();
    await dialog.getByRole("button", { name: /^guardar$/i }).click();

    await expect(page.getByText(/empresa actualizada/i)).toBeVisible({ timeout: 15_000 });
    await expect(card(page, companyName)).toContainText(/energía/i);
  });

  test("deactivates and reactivates it", async ({ page }) => {
    await page.goto("/admin/companies");

    await card(page, companyName).getByRole("button", { name: /acciones/i }).click();
    await page.getByRole("menuitem", { name: /desactivar/i }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: /^desactivar$/i }).click();
    await expect(page.getByText(/empresa desactivada/i)).toBeVisible({ timeout: 15_000 });
    await expect(card(page, companyName).getByText(/inactiva/i)).toBeVisible();

    await card(page, companyName).getByRole("button", { name: /acciones/i }).click();
    await page.getByRole("menuitem", { name: /activar/i }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: /^activar$/i }).click();
    await expect(page.getByText(/empresa activada/i)).toBeVisible({ timeout: 15_000 });
    await expect(card(page, companyName).getByText(/inactiva/i)).toHaveCount(0);
  });

  test("deletes the empty company", async ({ page }) => {
    await page.goto("/admin/companies");

    await card(page, companyName).getByRole("button", { name: /acciones/i }).click();
    await page.getByRole("menuitem", { name: /eliminar/i }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: /^eliminar$/i }).click();

    await expect(page.getByText(/empresa eliminada/i)).toBeVisible({ timeout: 15_000 });
    await expect(card(page, companyName)).toHaveCount(0);
  });

  test("refuses to delete the fixture company because it has data", async ({ page }) => {
    await page.goto("/admin/companies");

    await card(page, fixture.companyName).getByRole("button", { name: /acciones/i }).click();
    await page.getByRole("menuitem", { name: /eliminar/i }).click();
    const dialog = page.getByRole("alertdialog");
    await dialog.getByRole("button", { name: /^eliminar$/i }).click();

    await expect(
      page.getByText(/no puedes eliminar una empresa con sedes o usuarios/i),
    ).toBeVisible({ timeout: 15_000 });
  });
});
