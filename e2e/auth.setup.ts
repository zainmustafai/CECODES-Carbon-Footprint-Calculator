import { expect, test as setup } from "@playwright/test";
import { POST_LOGIN_PATH } from "../src/lib/routes";
import {
  ADMIN_STORAGE_STATE,
  E2E_PASSWORD,
  USER_STORAGE_STATE,
  loadFixture,
} from "./fixture";

// Log in once per role and reuse the sessions. TextField forwards `name` from register(), so
// the selectors below are stable.
//
// Both waits are domcontentloaded, not the default `load`. The suite runs against `bun run dev`,
// whose HMR socket keeps a request open, so `load` can simply never fire on a heavy authenticated
// page and the whole setup times out, taking the entire suite (and the storage state it writes)
// with it. The assertion below waits for a real element, which is the honest signal anyway. The
// same reasoning is already spelled out on the reload in data-entry.spec.ts.

setup("authenticate as the fixture company user", async ({ page }) => {
  const fixture = loadFixture();

  await page.goto("/login");
  await page.fill('input[name="email"]', fixture.email);
  await page.fill('input[name="password"]', E2E_PASSWORD);
  await page.getByRole("button", { name: /ingresar|sign in/i }).click();

  // Read from the constant, not written out again: this wait was left on /dashboard when the
  // landing page moved to /data-entry, and a stale copy here fails the setup, which takes the
  // whole suite with it.
  await page.waitForURL(`**${POST_LOGIN_PATH}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  await page.context().storageState({ path: USER_STORAGE_STATE });
});

setup("authenticate as the fixture CECODES admin", async ({ page }) => {
  const fixture = loadFixture();

  await page.goto("/login");
  await page.fill('input[name="email"]', fixture.adminEmail);
  await page.fill('input[name="password"]', E2E_PASSWORD);
  await page.getByRole("button", { name: /ingresar|sign in/i }).click();

  // An admin has no company, so the post-login path bounces them to the admin overview.
  await page.waitForURL("**/admin", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  await page.context().storageState({ path: ADMIN_STORAGE_STATE });
});
