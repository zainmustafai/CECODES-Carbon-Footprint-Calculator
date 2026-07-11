import { expect, test } from "@playwright/test";
import { loadFixture, type Fixture } from "./fixture";

// The default chromium project loads the company-user session, so the logout flow runs
// against a real signed-in session. The anonymous cases below drop that session with an
// empty storage state.

test.describe("session", () => {
  let fixture: Fixture;

  test.beforeAll(() => {
    fixture = loadFixture();
  });

  test("logging out returns to /login and protected pages become unreachable", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    // The user menu lives in the top bar; its trigger is labelled "Cuenta".
    await page.getByRole("button", { name: /cuenta/i }).click();
    await page.getByRole("menuitem", { name: /cerrar sesión/i }).click();

    await page.waitForURL("**/login");
    await expect(page).toHaveURL(/\/login/);

    // The session cookie is gone, so a protected route bounces straight back to /login.
    await page.goto("/dashboard");
    await page.waitForURL("**/login");
    await expect(page).toHaveURL(/\/login/);

    // Sanity: this is the login screen, not a stale dashboard render.
    await expect(page.getByRole("button", { name: /ingresar/i })).toBeVisible();
    // The fixture email is unused here beyond proving the fixture loaded.
    expect(fixture.email).toContain("@");
  });
});

test.describe("anonymous", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("a wrong password shows an inline error and stays on /login", async ({ page }) => {
    const fixture = loadFixture();

    await page.goto("/login");
    await page.fill('input[name="email"]', fixture.email);
    await page.fill('input[name="password"]', "definitely-the-wrong-password-1");
    await page.getByRole("button", { name: /ingresar/i }).click();

    await expect(page.getByText(/correo o contraseña incorrectos/i)).toBeVisible({
      timeout: 15_000,
    });
    await expect(page).toHaveURL(/\/login/);
  });

  test("an unauthenticated visit to /data-entry redirects to /login", async ({ page }) => {
    await page.goto("/data-entry");
    await page.waitForURL("**/login");
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("button", { name: /ingresar/i })).toBeVisible();
  });
});
