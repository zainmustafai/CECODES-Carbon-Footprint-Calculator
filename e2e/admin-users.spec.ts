import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { POST_LOGIN_PATH } from "../src/lib/routes";
import {
  ADMIN_STORAGE_STATE,
  E2E_EMAIL_DOMAIN,
  db,
  deleteE2EUser,
  loadFixture,
  type Fixture,
} from "./fixture";

// Admin CRUD over user accounts: create a company user, deactivate them (and prove the
// disabled account is refused at /login), reactivate, then delete.

test.use({ storageState: ADMIN_STORAGE_STATE });
test.describe.configure({ mode: "serial" });

const suffix = randomUUID().slice(0, 8);
const userEmail = `e2e-created-${suffix}@${E2E_EMAIL_DOMAIN}`;
const tempPassword = "E2e-Created-Temp-1!";
const regeneratedPassword = "E2e-Regen-Temp-2!";
// The regenerate test rotates the password mid-suite; later tests must sign in with whatever
// is CURRENT, not the original. Forgetting this makes the deactivate test fail on
// invalidCredentials before it ever reaches the accountDisabled check.
let currentPassword = tempPassword;

let fixture: Fixture;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const userRow = (page: Page) =>
  page.getByRole("row", { name: new RegExp(escapeRegExp(userEmail), "i") });

test.beforeAll(() => {
  fixture = loadFixture();
});

test.afterAll(async () => {
  // Defensive cleanup: the email-domain sweep in teardown covers this too, but delete now in
  // case a step bailed before the delete test ran.
  const client = await db();
  // The id is read first because it is the only handle on the GoTrue half, which deleteE2EUser
  // removes when there is one. email is unique, so there is at most one row to find.
  const rows = await client.query<{ id: string }>(`SELECT id FROM app_users WHERE email = $1`, [
    userEmail,
  ]);
  await deleteE2EUser(client, rows.rows[0]?.id ?? "", userEmail);
  await client.end();
});

test.describe("admin users", () => {
  test("creates a company user assigned to the fixture company", async ({ page }) => {
    await page.goto("/admin/users");

    await page.getByRole("button", { name: /nuevo usuario/i }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel(/^correo$/i).fill(userEmail);
    await dialog.getByLabel(/contraseña temporal/i).fill(tempPassword);
    // Role defaults to "Usuario Empresa"; assign the fixture company.
    await dialog.getByRole("combobox", { name: /empresa/i }).click();
    await page.getByRole("option", { name: fixture.companyName, exact: true }).click();
    await dialog.getByRole("button", { name: /nuevo usuario/i }).click();

    // The dialog stays open on the credentials box: the only moment the password is visible.
    await expect(dialog.getByText(/usuario creado/i)).toBeVisible({ timeout: 15_000 });
    await expect(dialog.getByText(userEmail)).toBeVisible();
    await expect(dialog.getByText(tempPassword)).toBeVisible();

    const download = page.waitForEvent("download");
    await dialog.getByRole("button", { name: /descargar/i }).click();
    expect((await download).suggestedFilename()).toBe(`credenciales-${userEmail}.txt`);

    await dialog.getByRole("button", { name: /^listo$/i }).click();
    await expect(userRow(page)).toBeVisible();
    await expect(userRow(page)).toContainText(fixture.companyName);
  });

  test("regenerates credentials: the old password is refused, the new one signs in", async ({
    page,
    browser,
  }) => {
    await page.goto("/admin/users");

    await userRow(page).getByRole("button", { name: /acciones/i }).click();
    await page.getByRole("menuitem", { name: /regenerar credenciales/i }).click();

    const dialog = page.getByRole("dialog");
    await dialog.getByLabel(/contraseña temporal/i).fill(regeneratedPassword);
    await dialog.getByRole("button", { name: /^regenerar$/i }).click();

    await expect(page.getByText(/credenciales regeneradas/i)).toBeVisible({ timeout: 15_000 });
    await expect(dialog.getByText(regeneratedPassword)).toBeVisible();
    await dialog.getByRole("button", { name: /^listo$/i }).click();
    currentPassword = regeneratedPassword;

    // Fresh anonymous context: the old password is dead, the new one works.
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const anon = await context.newPage();
    await anon.goto("/login");
    await anon.fill('input[name="email"]', userEmail);
    await anon.fill('input[name="password"]', tempPassword);
    await anon.getByRole("button", { name: /ingresar/i }).click();
    await expect(anon.getByText(/correo o contraseña incorrectos/i)).toBeVisible({
      timeout: 15_000,
    });

    await anon.fill('input[name="password"]', currentPassword);
    await anon.getByRole("button", { name: /ingresar/i }).click();
    await anon.waitForURL(`**${POST_LOGIN_PATH}`, { timeout: 20_000 });
    await context.close();
  });

  test("deactivating the user blocks their login", async ({ page, browser }) => {
    await page.goto("/admin/users");

    await userRow(page).getByRole("button", { name: /acciones/i }).click();
    await page.getByRole("menuitem", { name: /desactivar/i }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: /^desactivar$/i }).click();
    await expect(page.getByText(/usuario desactivado/i)).toBeVisible({ timeout: 15_000 });

    // A fresh anonymous context: the credentials are still valid, but the disabled account is
    // refused at the front door with a plain message.
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const anon = await context.newPage();
    await anon.goto("/login");
    await anon.fill('input[name="email"]', userEmail);
    await anon.fill('input[name="password"]', currentPassword);
    await anon.getByRole("button", { name: /ingresar/i }).click();
    await expect(anon.getByText(/tu cuenta fue desactivada/i)).toBeVisible({ timeout: 15_000 });
    await context.close();
  });

  test("reactivates and then deletes the user", async ({ page }) => {
    await page.goto("/admin/users");

    await userRow(page).getByRole("button", { name: /acciones/i }).click();
    await page.getByRole("menuitem", { name: /activar/i }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: /^activar$/i }).click();
    await expect(page.getByText(/usuario activado/i)).toBeVisible({ timeout: 15_000 });

    // Reactivation and deletion are two independent admin operations. After the reactivation
    // action, the in-place re-render from revalidatePath("/admin/users") can leave the client
    // table stale (the just-reactivated row not repainted), so reload the list before the second
    // operation. The row is in the database (the write succeeded), and the query has no filter or
    // pagination, so a fresh navigation renders it deterministically.
    await page.goto("/admin/users");
    await userRow(page).getByRole("button", { name: /acciones/i }).click();
    await page.getByRole("menuitem", { name: /eliminar/i }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: /^eliminar$/i }).click();
    await expect(page.getByText(/usuario eliminado/i)).toBeVisible({ timeout: 15_000 });
    await expect(userRow(page)).toHaveCount(0);
  });
});
