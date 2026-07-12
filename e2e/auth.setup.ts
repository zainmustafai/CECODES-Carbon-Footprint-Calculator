import { expect, test as setup } from "@playwright/test";
import {
  ADMIN_STORAGE_STATE,
  E2E_PASSWORD,
  USER_STORAGE_STATE,
  loadFixture,
} from "./fixture";

// Log in once per role and reuse the sessions. TextField forwards `name` from register(), so
// the selectors below are stable.

setup("authenticate as the fixture company user", async ({ page }) => {
  const fixture = loadFixture();

  await page.goto("/login");
  await page.fill('input[name="email"]', fixture.email);
  await page.fill('input[name="password"]', E2E_PASSWORD);
  await page.getByRole("button", { name: /ingresar|sign in/i }).click();

  await page.waitForURL("**/dashboard");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  await page.context().storageState({ path: USER_STORAGE_STATE });
});

setup("authenticate as the fixture CECODES admin", async ({ page }) => {
  const fixture = loadFixture();

  await page.goto("/login");
  await page.fill('input[name="email"]', fixture.adminEmail);
  await page.fill('input[name="password"]', E2E_PASSWORD);
  await page.getByRole("button", { name: /ingresar|sign in/i }).click();

  // An admin has no company, so /dashboard bounces them to the company list.
  await page.waitForURL("**/admin/companies");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  await page.context().storageState({ path: ADMIN_STORAGE_STATE });
});
