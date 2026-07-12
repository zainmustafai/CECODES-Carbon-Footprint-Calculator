import { expect, test } from "@playwright/test";
import { loadFixture, type Fixture } from "./fixture";

// The company profile form: edit name, sector and contact, save (spinner then success toast),
// and confirm the values survive a reload. The edited name keeps the "E2E " prefix and is then
// restored, so teardown's namespace sweep still matches the company either way.

test.describe.configure({ mode: "serial" });

let fixture: Fixture;

test.beforeAll(() => {
  fixture = loadFixture();
});

test.describe("company profile", () => {
  test("edits the profile and the values persist across a reload", async ({ page }) => {
    await page.goto("/company");
    await expect(
      page.getByRole("heading", { level: 1, name: /configuración de empresa/i }),
    ).toBeVisible();

    const editedName = `${fixture.companyName} editada`;
    const contact = "sostenibilidad@e2e.cecodes.invalid";

    await page.getByLabel(/nombre de la empresa/i).fill(editedName);

    await page.getByRole("combobox", { name: /sector/i }).click();
    await page.getByRole("option", { name: "Manufactura" }).click();

    await page.getByLabel(/contacto/i).fill(contact);

    const save = page.getByRole("button", { name: /guardar cambios/i });
    await save.click();
    await expect(page.getByText(/empresa actualizada/i)).toBeVisible({ timeout: 15_000 });

    await page.reload();
    await expect(page.getByLabel(/nombre de la empresa/i)).toHaveValue(editedName);
    await expect(page.getByRole("combobox", { name: /sector/i })).toHaveText(/manufactura/i);
    await expect(page.getByLabel(/contacto/i)).toHaveValue(contact);

    // Restore the original name.
    await page.getByLabel(/nombre de la empresa/i).fill(fixture.companyName);
    await page.getByRole("button", { name: /guardar cambios/i }).click();
    await expect(page.getByText(/empresa actualizada/i)).toBeVisible({ timeout: 15_000 });

    await page.reload();
    await expect(page.getByLabel(/nombre de la empresa/i)).toHaveValue(fixture.companyName);
  });
});
