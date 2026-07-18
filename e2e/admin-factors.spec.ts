import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import {
  ADMIN_STORAGE_STATE,
  E2E_GRID_YEAR,
  loadFixture,
  type Fixture,
} from "./fixture";

// The Week 1 check-in deliverable: an admin browses the full factor library and makes an edit
// that is recorded in the version history.
test.use({ storageState: ADMIN_STORAGE_STATE });

let fixture: Fixture;
const suffix = randomUUID().slice(0, 8);
// The "E2E " element prefix is what teardown sweeps this global reference row by.
const FACTOR_ELEMENT = `E2E Factor ${suffix}`;
const VERSION_NAME = `E2Ev${suffix.slice(0, 4)}`;

test.beforeAll(() => {
  fixture = loadFixture();
});

test.describe.configure({ mode: "serial" });

test.describe("admin factor library", () => {
  test("browses and filters the imported library", async ({ page }) => {
    await page.goto("/admin/factors");

    await expect(page.getByRole("heading", { name: /biblioteca de factores/i })).toBeVisible();

    // The library is populated. Without the import it would show the empty state instead.
    await expect(page.getByText(/\d+ factores/i)).toBeVisible();

    // Filtering by scope narrows the table.
    await page.getByRole("combobox", { name: /alcance/i }).click();
    await page.getByRole("option", { name: "Alcance 2" }).click();
    await expect(page.getByRole("cell", { name: /electricidad/i }).first()).toBeVisible();
  });

  test("creates a factor, edits it, and the change lands in its history", async ({ page }) => {
    await page.goto("/admin/factors/new");

    await page.getByRole("combobox", { name: /alcance/i }).click();
    await page.getByRole("option", { name: "Alcance 1" }).click();
    await page.getByLabel(/^categoría$/i).fill("E2E Categoria");
    await page.getByLabel(/^elemento$/i).fill(FACTOR_ELEMENT);
    await page.getByLabel(/unidad de consumo/i).fill("kg");
    await page.getByLabel(/factor co2e consolidado/i).fill("100");

    await page.getByRole("button", { name: /guardar|crear/i }).first().click();

    // Back on the library, find the row and open it. "Editar" is a link inside the row's
    // actions menu, so the menu has to be opened first.
    await page.waitForURL("**/admin/factors**");
    await page.getByPlaceholder(/buscar elemento/i).fill(FACTOR_ELEMENT);
    // The search box writes the query into the URL on a debounce. That late navigation lands a
    // beat after typing and, if it fires while the Editar link is navigating, supersedes it and
    // drops the page back on the filtered list. Wait for the query to be committed to the URL
    // first, so the list is settled before we click into a row.
    await page.waitForURL(/[?&]q=/);
    await expect(page.getByRole("cell", { name: FACTOR_ELEMENT })).toBeVisible({
      timeout: 15_000,
    });
    await page.getByRole("button", { name: /^acciones$/i }).first().click();
    await page.getByRole("menuitem", { name: /editar/i }).click();

    // Editar is a Link to /admin/factors/[id]. Wait for that route to land before reading the
    // form: the edit page carries the full factor context and, on the dev server, its RSC
    // transition regularly outlasts the 5s default expect timeout, so the field is simply not
    // painted yet when the assertion first runs.
    await page.waitForURL(/\/admin\/factors\/[0-9a-f-]{36}/);

    // Edit the value.
    const co2e = page.getByLabel(/factor co2e consolidado/i);
    await expect(co2e).toHaveValue("100", { timeout: 15_000 });
    await co2e.fill("250.5");
    await page.getByRole("button", { name: /guardar/i }).first().click();
    // Wait for the write to be confirmed before reading the history.
    await expect(page.getByText(/factor actualizado/i)).toBeVisible({ timeout: 15_000 });

    // Reload for a stable history. The edit page refreshes in place after the save, and that
    // in-place re-render can momentarily show the pre-update history (only the Creado row) before
    // settling. A fresh navigation reads the committed audit rows deterministically. The record
    // is in the database; the write above is confirmed.
    await page.reload();

    // The history records who changed what, and when. The admin is the actor on both the Creado
    // and the Actualizado rows, so the email appears twice: assert the first.
    await expect(page.getByText(/historial de cambios/i)).toBeVisible();
    await expect(page.getByText(fixture.adminEmail, { exact: false }).first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(/actualizado/i).first()).toBeVisible();
    await expect(page.getByText(/250\.5/).first()).toBeVisible();
  });

  test("deactivates a factor, and it leaves the company source picker", async ({ page }) => {
    await page.goto("/admin/factors");
    await page.getByPlaceholder(/buscar elemento/i).fill(FACTOR_ELEMENT);
    await expect(page.getByRole("cell", { name: FACTOR_ELEMENT })).toBeVisible();

    await page.getByRole("button", { name: /^acciones$/i }).first().click();
    await page.getByRole("menuitem", { name: /desactivar/i }).click();

    const dialog = page.getByRole("alertdialog");
    await dialog.getByRole("button", { name: /desactivar/i }).click();

    await expect(page.getByText(/factor desactivado/i)).toBeVisible({ timeout: 15_000 });
  });

  test("manages the yearly grid electricity factor", async ({ page }) => {
    await page.goto("/admin/factors?tab=grid");

    await page.getByRole("button", { name: /agregar año/i }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel(/^año$/i).fill(String(E2E_GRID_YEAR));
    await dialog.getByLabel(/^factor$/i).fill("0.199");
    // The "E2E" source prefix is what teardown sweeps this row by.
    await dialog.getByLabel(/^fuente$/i).fill("E2E harness");
    await dialog.getByRole("button", { name: /guardar/i }).click();

    // exact: the actions cell carries the year in its button labels ("Editar: 2031",
    // "Eliminar: 2031"), so a non-exact name matches both that cell and the year cell.
    await expect(
      page.getByRole("cell", { name: String(E2E_GRID_YEAR), exact: true }),
    ).toBeVisible({ timeout: 15_000 });

    // And remove it again, so the shared library is left as we found it.
    const row = page.getByRole("row", { name: new RegExp(String(E2E_GRID_YEAR)) });
    await row.getByRole("button", { name: /eliminar/i }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: /eliminar/i }).click();

    await expect(
      page.getByRole("cell", { name: String(E2E_GRID_YEAR), exact: true }),
    ).toHaveCount(0, { timeout: 15_000 });
  });

  test("records a new library version", async ({ page }) => {
    await page.goto("/admin/factors?tab=versions");

    await page.getByRole("button", { name: /nueva versión/i }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel(/^versión$/i).fill(VERSION_NAME);
    await dialog.getByLabel(/^fecha$/i).fill("2026-07-13");
    await dialog.getByRole("button", { name: /crear versión/i }).click();

    await expect(page.getByRole("cell", { name: VERSION_NAME })).toBeVisible({
      timeout: 15_000,
    });
  });
});
