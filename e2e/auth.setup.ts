import { expect, test as setup } from "@playwright/test";
import { E2E_PASSWORD, loadFixture } from "./fixture";

const STORAGE_STATE = "e2e/.auth/user.json";

// Log in once and reuse the session. TextField forwards `name` from register(), so the
// selectors below are stable.
setup("authenticate as the fixture company user", async ({ page }) => {
  const fixture = loadFixture();

  await page.goto("/login");
  await page.fill('input[name="email"]', fixture.email);
  await page.fill('input[name="password"]', E2E_PASSWORD);
  await page.getByRole("button", { name: /ingresar|sign in/i }).click();

  await page.waitForURL("**/dashboard");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  await page.context().storageState({ path: STORAGE_STATE });
});
