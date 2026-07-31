import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import {
  ADMIN_STORAGE_STATE,
  E2E_EMAIL_DOMAIN,
  E2E_YEAR,
  loadFixture,
  type Fixture,
} from "./fixture";

// Admin CRUD over companies. Creation happens in the wizard DIALOG opened by the "Nueva
// empresa" button on /admin/companies (the old /admin/companies/new route is gone). The
// wizard is data-ready: company + optional sede + optional first reporting year + optional
// user, ending on a summary with the user's credentials.
//
// Teardown safety: the fixture sweep removes companies whose name starts with "E2E " and auth
// users at the e2e email domain, which covers everything created here.

test.use({ storageState: ADMIN_STORAGE_STATE });
test.describe.configure({ mode: "serial" });

const suffix = randomUUID().slice(0, 8);
const fullCompany = `E2E Empresa ${suffix}`;
const minimalCompany = `E2E Empresa Vacia ${suffix}`;
const userEmail = `e2e-wizard-${suffix}@${E2E_EMAIL_DOMAIN}`;

let fixture: Fixture;

test.beforeAll(() => {
  fixture = loadFixture();
});

const card = (page: Page, name: string) =>
  page.locator('[data-slot="card"]').filter({ hasText: name });

test.describe("admin companies", () => {
  test("creates a fully provisioned company through the wizard dialog", async ({ page }) => {
    await page.goto("/admin/companies");

    await page.getByRole("button", { name: /nueva empresa/i }).click();
    // Unnamed on purpose: the dialog's accessible name follows its title, which changes from
    // "Nueva empresa" to "Empresa creada" when the summary swaps in.
    const dialog = page.getByRole("dialog");

    // Step Empresa: only the name is required; sector and contact email come along.
    await dialog.getByLabel(/nombre de la empresa/i).fill(fullCompany);
    await dialog.getByRole("combobox", { name: /sector/i }).click();
    await page.getByRole("option", { name: "Manufactura" }).click();
    await dialog.getByLabel(/correo de contacto/i).fill(`contacto-${suffix}@${E2E_EMAIL_DOMAIN}`);
    await dialog.getByRole("button", { name: /siguiente/i }).click();

    // Step Sede.
    await dialog.getByLabel(/nombre de la sede/i).fill("Sede Principal");
    await dialog.getByLabel(/ubicaci/i).fill("Cali");
    await dialog.getByRole("button", { name: /siguiente/i }).click();

    // Step Año: enabled because the sede step was filled.
    await dialog.getByLabel(/^año$/i).fill(String(E2E_YEAR));
    await dialog.getByRole("button", { name: /siguiente/i }).click();

    // Step Usuario.
    await dialog.getByLabel(/correo electrónico/i).fill(userEmail);
    await dialog.getByRole("button", { name: /generar/i }).click();
    await dialog.getByRole("button", { name: /crear empresa/i }).click();

    // Summary: each provisioning line plus the credentials box with the .txt download.
    await expect(dialog.getByText(/^empresa creada: /i)).toBeVisible({ timeout: 20_000 });
    await expect(dialog.getByText(/sede creada/i)).toBeVisible();
    await expect(dialog.getByText(/año de reporte creado/i)).toBeVisible();
    await expect(dialog.getByText(new RegExp(`usuario creado.*${suffix}`, "i"))).toBeVisible();
    await expect(dialog.getByText(/credenciales del usuario/i)).toBeVisible();

    const download = page.waitForEvent("download");
    await dialog.getByRole("button", { name: /descargar/i }).click();
    expect((await download).suggestedFilename()).toBe(`credenciales-${userEmail}.txt`);

    await dialog.getByRole("button", { name: /^cerrar$/i }).click();
    await expect(dialog).toHaveCount(0);

    // The list behind the dialog already refreshed (router.refresh ran on success).
    await expect(card(page, fullCompany)).toBeVisible();
    await expect(card(page, fullCompany)).toContainText(/1 sede/i);
    await expect(card(page, fullCompany)).toContainText(/1 usuario/i);
  });

  test("confirms discard when dirty, and creates a minimal company skipping every optional step", async ({
    page,
  }) => {
    await page.goto("/admin/companies");

    // Dirty close: typing anything and closing must ask before discarding.
    await page.getByRole("button", { name: /nueva empresa/i }).click();
    let dialog = page.getByRole("dialog");
    await dialog.getByLabel(/nombre de la empresa/i).fill("E2E Borrador");
    await page.keyboard.press("Escape");
    const discard = page.getByRole("alertdialog");
    await expect(discard.getByText(/descartar la nueva empresa/i)).toBeVisible();
    await discard.getByRole("button", { name: /seguir editando/i }).click();
    await expect(dialog.getByLabel(/nombre de la empresa/i)).toHaveValue("E2E Borrador");
    await page.keyboard.press("Escape");
    await page.getByRole("alertdialog").getByRole("button", { name: /^descartar$/i }).click();
    await expect(dialog).toHaveCount(0);

    // Minimal create: name only, Siguiente through the three optional steps.
    await page.getByRole("button", { name: /nueva empresa/i }).click();
    dialog = page.getByRole("dialog");
    await dialog.getByLabel(/nombre de la empresa/i).fill(minimalCompany);
    await dialog.getByRole("button", { name: /siguiente/i }).click();
    await dialog.getByRole("button", { name: /siguiente/i }).click();
    // The year step explains it needs a sede instead of offering an input.
    await expect(dialog.getByText(/este paso necesita una sede/i)).toBeVisible();
    await dialog.getByRole("button", { name: /siguiente/i }).click();
    await dialog.getByRole("button", { name: /crear empresa/i }).click();

    await expect(dialog.getByText(/^empresa creada: /i)).toBeVisible({ timeout: 20_000 });
    await expect(dialog.getByText(/sin sede inicial/i)).toBeVisible();
    await expect(dialog.getByText(/sin primer año/i)).toBeVisible();
    await expect(dialog.getByText(/sin usuario inicial/i)).toBeVisible();
    await dialog.getByRole("button", { name: /^cerrar$/i }).click();

    await expect(card(page, minimalCompany)).toBeVisible();
    await expect(card(page, minimalCompany)).toContainText(/sin sedes/i);
    await expect(card(page, minimalCompany)).toContainText(/sin usuarios/i);
  });

  test("edits its sector", async ({ page }) => {
    await page.goto("/admin/companies");

    await card(page, minimalCompany).getByRole("button", { name: /acciones/i }).click();
    await page.getByRole("menuitem", { name: /editar/i }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("combobox", { name: /sector/i }).click();
    await page.getByRole("option", { name: "Energía" }).click();
    await dialog.getByRole("button", { name: /^guardar$/i }).click();

    await expect(page.getByText(/empresa actualizada/i)).toBeVisible({ timeout: 15_000 });
    await expect(card(page, minimalCompany)).toContainText(/energía/i);
  });

  test("deactivates and reactivates it", async ({ page }) => {
    await page.goto("/admin/companies");

    await card(page, minimalCompany).getByRole("button", { name: /acciones/i }).click();
    await page.getByRole("menuitem", { name: /desactivar/i }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: /^desactivar$/i }).click();
    await expect(page.getByText(/empresa desactivada/i)).toBeVisible({ timeout: 15_000 });
    await expect(card(page, minimalCompany).getByText(/inactiva/i)).toBeVisible();

    // Reactivation is a second, independent operation. Reload between the two: the in-place
    // re-render after the deactivate action leaves the confirm dialog's backdrop briefly over the
    // card, so clicking its actions button races an obscured element and hangs. A fresh list is
    // deterministic (the company is in the database either way).
    await page.goto("/admin/companies");
    await card(page, minimalCompany).getByRole("button", { name: /acciones/i }).click();
    await page.getByRole("menuitem", { name: /activar/i }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: /^activar$/i }).click();
    await expect(page.getByText(/empresa activada/i)).toBeVisible({ timeout: 15_000 });
    await expect(card(page, minimalCompany).getByText(/inactiva/i)).toHaveCount(0);
  });

  test("deletes the empty company", async ({ page }) => {
    await page.goto("/admin/companies");

    await card(page, minimalCompany).getByRole("button", { name: /acciones/i }).click();
    await page.getByRole("menuitem", { name: /eliminar/i }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: /^eliminar$/i }).click();

    await expect(page.getByText(/empresa eliminada/i)).toBeVisible({ timeout: 15_000 });
    await expect(card(page, minimalCompany)).toHaveCount(0);
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
