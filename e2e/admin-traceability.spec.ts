import { expect, test } from "@playwright/test";
import { ADMIN_STORAGE_STATE } from "./fixture";

// The cross-company data-entry audit, admins only. The feed content is data dependent (the shared
// database may or may not hold changes when this runs), so the assertions are on the surface that
// always renders: the heading, the subtitle, and an honest empty-or-populated body, never a crash.
// The requireAdmin guard for this route is proven in cross-tenant.spec.ts.

test.use({ storageState: ADMIN_STORAGE_STATE });

test.describe("admin traceability", () => {
  test("renders the cross-company audit page", async ({ page }) => {
    await page.goto("/admin/traceability");

    await expect(
      page.getByRole("heading", { name: /^trazabilidad$/i, level: 1 }),
    ).toBeVisible();
    await expect(page.getByText(/quién cambió qué dato/i)).toBeVisible();
    // The company filter (its accessible name comes from the "Empresa" label).
    await expect(page.getByRole("combobox", { name: /empresa/i })).toBeVisible();
  });

  test("a future date range shows the honest empty state", async ({ page }) => {
    await page.goto("/admin/traceability?from=2035-01-01");
    await expect(page.getByText(/no hay cambios registrados/i)).toBeVisible();
  });
});
