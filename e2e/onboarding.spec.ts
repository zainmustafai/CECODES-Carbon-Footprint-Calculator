import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { E2E_EMAIL_DOMAIN, E2E_PASSWORD, db, supabaseAdmin } from "./fixture";

// A brand new user with no company is provisioned directly through the Supabase admin API,
// signs in through the real /login UI, and is routed to /onboarding by the dashboard guard.
// The signup trigger writes the app_users row; deleting the auth user does NOT remove it, so
// the profile row and any company this user creates are cleaned up explicitly.

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
    await expect(page.getByRole("heading", { name: /configura tu empresa/i })).toBeVisible();
  });

  test("submitting empty shows validation errors", async () => {
    await page.getByRole("button", { name: /crear empresa/i }).click();

    await expect(page.getByText(/el nombre de la empresa es obligatorio/i)).toBeVisible();
    await expect(page.getByText(/el nombre de la planta es obligatorio/i)).toBeVisible();
    await expect(page.getByText(/la ubicación es obligatoria/i)).toBeVisible();
  });

  test("the sector field is a curated Select, not a free-text input", async () => {
    const sector = page.getByRole("combobox", { name: /sector/i });
    await expect(sector).toBeVisible();

    await sector.click();
    // Curated options straight from src/lib/sectors.ts.
    await expect(page.getByRole("option", { name: "Manufactura" })).toBeVisible();
    await expect(page.getByRole("option", { name: "Energía" })).toBeVisible();
    await page.getByRole("option", { name: "Manufactura" }).click();
  });

  test("completing company and first facility lands on the dashboard", async () => {
    await page.getByLabel(/nombre de la empresa/i).fill(companyName);
    await page.getByLabel(/^planta$/i).fill("Planta Onboarding");
    await page.getByLabel(/ubicación/i).fill("Bogotá, Colombia");

    await page.getByRole("button", { name: /crear empresa/i }).click();

    await page.waitForURL("**/dashboard");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });
});
