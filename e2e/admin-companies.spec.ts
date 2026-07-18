import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { ADMIN_STORAGE_STATE, loadFixture, type Fixture } from "./fixture";

// Admin CRUD over companies: create, edit sector, deactivate/activate, delete an empty
// company, and confirm that deleting a company that still has data is refused.
//
// Creation goes through the multi-step wizard at /admin/companies/new. The header "Nueva
// empresa" control is a LINK to that route now, not a dialog trigger. Editing still uses the
// dialog, reached from the row-actions menu.

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
  test("creates a company through the onboarding wizard", async ({ page }) => {
    await page.goto("/admin/companies");

    await page.getByRole("link", { name: /nueva empresa/i }).click();
    await page.waitForURL("**/admin/companies/new");

    // Step 1: the company itself. Both fields are required.
    await page.getByLabel(/nombre de la empresa/i).fill(companyName);
    await page.getByRole("combobox", { name: /sector/i }).click();
    await page.getByRole("option", { name: "Manufactura" }).click();
    await page.getByRole("button", { name: /siguiente/i }).click();

    // Step 2 (first sede) and step 3 (first user) are both optional. Skip them: this spec
    // owns the company-CRUD path, and the facility and user paths have their own specs.
    await page.getByRole("button", { name: /siguiente/i }).click();
    await page.getByRole("button", { name: /crear empresa/i }).click();

    // The wizard ends on a summary screen, not back on the list.
    await expect(page.getByText(/empresa creada/i).first()).toBeVisible({ timeout: 20_000 });
    await page.getByRole("link", { name: /ver empresas/i }).click();

    // Wait for the list to actually land before asserting. The summary screen renders its own
    // cards, so until it unmounts, card(companyName) matches both the summary card and the list
    // card and trips strict mode. The list URL and its heading are the signal it has arrived.
    await page.waitForURL(/\/admin\/companies$/);
    await expect(page.getByRole("heading", { name: /^empresas$/i })).toBeVisible();

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

    // Reactivation is a second, independent operation. Reload between the two: the in-place
    // re-render after the deactivate action leaves the confirm dialog's backdrop briefly over the
    // card, so clicking its actions button races an obscured element and hangs. A fresh list is
    // deterministic (the company is in the database either way).
    await page.goto("/admin/companies");
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
