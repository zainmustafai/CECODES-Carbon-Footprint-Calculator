import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { E2E_YEAR, db, loadFixture, type Fixture } from "./fixture";

// Runs axe and returns the critical/serious violations as readable strings that name the
// offending element and its contrast, so a failure points straight at what to fix.
async function seriousViolations(page: Page): Promise<string[]> {
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  return results.violations
    .filter((v) => v.impact === "critical" || v.impact === "serious")
    .flatMap((v) =>
      v.nodes.map((n) => {
        const detail = (n.failureSummary ?? "")
          .split("\n")
          .map((line) => line.trim())
          .find((line) => /contrast|ratio/i.test(line));
        return `${v.id} (${v.impact}) at ${n.target.join(" ")}${detail ? ` :: ${detail}` : ""}`;
      }),
    );
}

// Automated accessibility gate. axe-core is run over the main authenticated screens and the
// anonymous login screen; the suite fails on any WCAG 2 A/AA violation of "critical" or
// "serious" impact. A reporting year is created on the fixture facility for the data-entry
// scan and removed afterwards, so the data-entry spec still starts from a clean facility.

const TAGS = ["wcag2a", "wcag2aa"];

let fixture: Fixture;

test.beforeAll(async () => {
  fixture = loadFixture();
  const client = await db();
  await client.query(
    `INSERT INTO reporting_years (id, "facilityId", "companyId", year, "gwpSet", "createdAt", "updatedAt")
     VALUES (gen_random_uuid()::text, $1, $2, $3, 'AR6'::"GwpSet", now(), now())
     ON CONFLICT ("facilityId", year) DO NOTHING`,
    [fixture.facilityId, fixture.companyId, E2E_YEAR],
  );
  await client.end();
});

test.afterAll(async () => {
  const client = await db();
  await client.query(`DELETE FROM reporting_years WHERE "facilityId" = $1 AND year = $2`, [
    fixture.facilityId,
    E2E_YEAR,
  ]);
  await client.end();
});

test.describe("accessibility", () => {
  for (const path of ["/dashboard", "/facilities", "/company"]) {
    test(`has no critical or serious a11y violations on ${path}`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

      expect(await seriousViolations(page)).toEqual([]);
    });
  }

  test("has no critical or serious a11y violations on /data-entry", async ({ page }) => {
    await page.goto(`/data-entry?facilityId=${fixture.facilityId}&year=${E2E_YEAR}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    // Expand one category so the scan covers its controls.
    await page.locator("section").first().getByRole("button").first().click();

    expect(await seriousViolations(page)).toEqual([]);
  });
});

test.describe("accessibility (anonymous)", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("has no critical or serious a11y violations on /login", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("button", { name: /ingresar/i })).toBeVisible();

    expect(await seriousViolations(page)).toEqual([]);
  });
});
