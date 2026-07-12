import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { E2E_EMAIL_DOMAIN, E2E_PASSWORD, db, loadFixture, supabaseAdmin } from "./fixture";

// THE LOGOUT TEST MUST OWN ITS USER. Do not point it at the shared fixture session.
//
// Supabase's signOut() revokes the refresh token SERVER SIDE, and globally: it kills every
// session that user has, not just this browser context. This test used to run against the shared
// company-user storageState (e2e/.auth/user.json), so the moment it logged out, that token was
// dead, and every spec Playwright ran afterwards (alphabetically: company-profile, cross-tenant,
// data-entry, facilities-crud, meta) silently loaded an invalid session and got bounced to /login.
// They then failed on assertions that had nothing to do with what they were testing, or, worse,
// passed VACUOUSLY: an isolation test asserting "the victim's name is not on this page" passes
// beautifully when the page is the login screen.
//
// So this provisions a disposable user of its own, linked to the fixture company so /dashboard
// has something to render, signs it in through the real /login UI, and logs THAT one out.

const suffix = randomUUID().slice(0, 8);
const logoutEmail = `e2e-logout-${suffix}@${E2E_EMAIL_DOMAIN}`;

test.describe("session", () => {
  let userId = "";

  test.beforeAll(async () => {
    const fixture = loadFixture();

    const { data, error } = await supabaseAdmin().auth.admin.createUser({
      email: logoutEmail,
      password: E2E_PASSWORD,
      email_confirm: true,
    });
    if (error || !data.user) {
      throw new Error(`E2E: could not create logout user ${logoutEmail}. ${error?.message}`);
    }
    userId = data.user.id;

    // The signup trigger writes the app_users row with no company; link it to the fixture
    // company so the dashboard renders instead of redirecting to /onboarding.
    const client = await db();
    await client.query(
      `INSERT INTO app_users (id, email, role, "companyId", "createdAt", "updatedAt")
       VALUES ($1, $2, 'COMPANY_USER', $3, now(), now())
       ON CONFLICT (id) DO UPDATE SET "companyId" = EXCLUDED."companyId"`,
      [userId, logoutEmail, fixture.companyId],
    );
    await client.end();
  });

  test.afterAll(async () => {
    const client = await db();
    await client.query(`DELETE FROM app_users WHERE id = $1 OR email = $2`, [
      userId,
      logoutEmail,
    ]);
    await client.end();
    if (userId) await supabaseAdmin().auth.admin.deleteUser(userId);
  });

  // Its own anonymous context: it signs in as the disposable user, not as the shared fixture one.
  test.use({ storageState: { cookies: [], origins: [] } });

  test("logging out returns to /login and protected pages become unreachable", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.fill('input[name="email"]', logoutEmail);
    await page.fill('input[name="password"]', E2E_PASSWORD);
    await page.getByRole("button", { name: /ingresar/i }).click();

    await page.waitForURL("**/dashboard", { timeout: 20_000 });
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
