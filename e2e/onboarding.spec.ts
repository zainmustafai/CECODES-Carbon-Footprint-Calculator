import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { E2E_EMAIL_DOMAIN, E2E_PASSWORD, createE2EUser, db, deleteE2EUser } from "./fixture";

// Self-serve onboarding is disabled (FEATURE_SELF_ONBOARDING): a self-registered colleague would
// create a DUPLICATE company instead of joining their own, so CECODES provisions every account.
// A brand new user with no company is provisioned by createE2EUser, signs in through the real
// /login UI, is routed to /onboarding by the dashboard guard, and must be told to contact CECODES
// rather than shown a company-creation form. Under the Supabase modes the profile is NOT removed
// by deleting the auth user, so both stores are cleaned up explicitly; deleteE2EUser does both.

test.describe.configure({ mode: "serial" });

const suffix = randomUUID().slice(0, 8);
const email = `onboarding-${suffix}@${E2E_EMAIL_DOMAIN}`;
const companyName = `E2E Onboarding ${suffix}`;

let userId = "";
let page: Page;

test.describe("onboarding", () => {
  test.beforeAll(async ({ browser }) => {
    // No company on purpose: being routed to /onboarding is the whole subject of this spec.
    const client = await db();
    userId = await createE2EUser(client, email);
    await client.end();

    // A single anonymous context, reused across the serial steps so the user logs in once.
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    page = await context.newPage();
  });

  test.afterAll(async () => {
    await page?.context().close();

    const client = await db();
    // app_users first: the profile row references the company it created.
    await deleteE2EUser(client, userId, email);
    await client.query(`DELETE FROM companies WHERE name = $1`, [companyName]);
    await client.end();
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
