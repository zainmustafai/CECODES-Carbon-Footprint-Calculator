import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { E2E_EMAIL_DOMAIN, E2E_PASSWORD, db, supabaseAdmin } from "./fixture";

// Self-serve onboarding is disabled (FEATURE_SELF_ONBOARDING): a self-registered colleague would
// create a DUPLICATE company instead of joining their own, so CECODES provisions every account.
// A brand new user with no company is provisioned through the Supabase admin API, signs in through
// the real /login UI, is routed to /onboarding by the dashboard guard, and must be told to contact
// CECODES rather than shown a company-creation form. The signup trigger writes the app_users row;
// deleting the auth user does NOT remove it, so the profile row is cleaned up explicitly.

test.describe.configure({ mode: "serial" });

const suffix = randomUUID().slice(0, 8);
const email = `onboarding-${suffix}@${E2E_EMAIL_DOMAIN}`;
const companyName = `E2E Onboarding ${suffix}`;

let userId = "";
let page: Page;

test.describe("onboarding", () => {
  test.beforeAll(async ({ browser }) => {
    const { data, error } = await supabaseAdmin().auth.admin.createUser({
      email,
      password: E2E_PASSWORD,
      email_confirm: true,
    });
    if (error || !data.user) {
      throw new Error(`E2E: could not create onboarding user ${email}. ${error?.message}`);
    }
    userId = data.user.id;

    // A single anonymous context, reused across the serial steps so the user logs in once.
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    page = await context.newPage();
  });

  test.afterAll(async () => {
    await page?.context().close();

    const client = await db();
    // app_users first: the profile row references the company it created.
    await client.query(`DELETE FROM app_users WHERE id = $1 OR email = $2`, [userId, email]);
    await client.query(`DELETE FROM companies WHERE name = $1`, [companyName]);
    await client.end();

    if (userId) await supabaseAdmin().auth.admin.deleteUser(userId);
  });

  test("signs in and is routed to onboarding", async () => {
    await page.goto("/login");
    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', E2E_PASSWORD);
    await page.getByRole("button", { name: /ingresar/i }).click();

    await page.waitForURL("**/onboarding");
  });

  test("is told to contact CECODES, and is offered no company-creation form", async () => {
    await expect(
      page.getByRole("heading", { name: /tu cuenta aún no tiene empresa/i }),
    ).toBeVisible();
    // The self-serve form is gone: no company-name field and no create button.
    await expect(page.getByRole("button", { name: /crear empresa/i })).toHaveCount(0);
    await expect(page.getByLabel(/nombre de la empresa/i)).toHaveCount(0);
  });

  test("no company was created for this user", async () => {
    const client = await db();
    const rows = await client.query<{ count: string }>(
      `SELECT count(*)::text FROM companies WHERE name = $1`,
      [companyName],
    );
    await client.end();
    expect(rows.rows[0].count).toBe("0");
  });
});
