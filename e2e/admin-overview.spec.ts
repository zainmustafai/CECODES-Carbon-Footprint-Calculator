import { expect, test } from "@playwright/test";
import { ADMIN_STORAGE_STATE } from "./fixture";

// The admin home. An admin lands here after sign-in (auth.setup now waits for /admin). This spec
// checks the overview renders its panels and that /dashboard bounces an admin here.

test.use({ storageState: ADMIN_STORAGE_STATE });

test.describe("admin overview", () => {
  test("renders the portfolio, the follow-up list and the activity feed", async ({ page }) => {
    await page.goto("/admin");

    await expect(
      page.getByRole("heading", { name: /panel de administración/i, level: 1 }),
    ).toBeVisible();
    await expect(page.getByText(/estado del portafolio/i)).toBeVisible();
    await expect(page.getByText(/requieren seguimiento/i)).toBeVisible();
    await expect(page.getByText(/actividad reciente/i)).toBeVisible();
  });

  test("a fresh /dashboard visit bounces an admin to the overview", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/admin$/);
    await expect(
      page.getByRole("heading", { name: /panel de administración/i }),
    ).toBeVisible();
  });
});
