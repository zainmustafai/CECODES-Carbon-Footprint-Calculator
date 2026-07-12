import { expect, test } from "@playwright/test";
import { E2E_YEAR, db, loadFixture, type Fixture } from "./fixture";

// THE ISOLATION PROOF (Definition of Done 14.3: "multiple companies ... with fully isolated data").
//
// Everything else in this repo tests isolation in the abstract: company-scope.test.ts proves the
// resolvers refuse a foreign company, and action-authorization.test.ts proves the actions call
// them. Both mock the database. Neither sends a single byte over HTTP.
//
// This spec is the only thing that runs the real stack: real session cookie, real proxy, real
// Prisma, real Postgres. It signs in as the fixture company and points every reachable surface at
// a SECOND company's real ids (global-setup provisions it as the "victim"), then asserts two things
// every time:
//
//   1. the response refuses, and
//   2. the victim's data is STILL THERE afterwards. A refusal that had already written would be
//      worse than no refusal, because the status code would look reassuring.
//
// RLS does not protect any of this. Prisma connects as the database owner and bypasses every
// policy (see src/lib/auth/company-scope.ts). The guards in company-scope.ts are the whole defence.

let fixture: Fixture;

test.beforeAll(() => {
  fixture = loadFixture();
});

// Reads the victim's row count straight from Postgres, bypassing the app entirely. If the app ever
// did write across the tenant boundary, this is what would notice.
async function victimFacilityCount(): Promise<number> {
  const client = await db();
  const result = await client.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM facilities WHERE "companyId" = $1`,
    [fixture.victimCompanyId],
  );
  await client.end();
  return Number(result.rows[0].count);
}

// requireAdmin() calls notFound(), and the company user correctly lands on the not-found page.
// The HTTP STATUS, however, is 200, not 404: the (app) layout (sidebar, topbar) has already
// streamed by the time the page throws, so the response is committed before the 404 can be set.
//
// That is a real defect, and it is recorded as one (see docs/COMPLETION_PLAN.md). It is NOT an
// isolation failure: no admin content is served either way, and an attacker probing for the admin
// area learns nothing from a 200 that renders "Página no encontrada". So these tests assert the
// thing that actually protects the tenant (no admin content, ever) rather than a status code whose
// value is decided by streaming.
const NOT_FOUND_COPY = /página no encontrada/i;

test.describe("cross-tenant isolation", () => {
  test("the admin area is invisible to a company user", async ({ page }) => {
    for (const path of ["/admin/companies", "/admin/users", "/admin/factors"]) {
      await page.goto(path);

      await expect(page.getByText(NOT_FOUND_COPY), `${path} must not render`).toBeVisible();
      // The admin screens' own headings must be nowhere on the page.
      await expect(page.getByRole("heading", { name: /^empresas$/i })).toHaveCount(0);
      await expect(page.getByRole("heading", { name: /^usuarios$/i })).toHaveCount(0);
      await expect(page.getByRole("heading", { name: /biblioteca de factores/i })).toHaveCount(0);
    }
  });

  test("a company user cannot open another company's workspace through the admin drill-down", async ({
    page,
  }) => {
    // These routes render the SAME screens the company user legitimately sees at /dashboard and
    // /data-entry, only pointed at another company by a URL segment. If requireAdmin were ever
    // dropped from one of them, this is the test that fails.
    const base = `/admin/companies/${fixture.victimCompanyId}`;

    for (const path of ["/dashboard", "/data-entry", "/preview", "/company"]) {
      await page.goto(`${base}${path}`);

      await expect(
        page.getByText(NOT_FOUND_COPY),
        `${base}${path} must not render`,
      ).toBeVisible();
      // And nothing of the victim's leaked into the body on the way there.
      await expect(page.locator("body")).not.toContainText(fixture.victimCompanyName);
      await expect(page.locator("body")).not.toContainText("Planta Victima");
    }
  });

  test("the export route refuses another company's data", async ({ request }) => {
    // A GET Route Handler runs no layout, so requireAppUser never executes for it. It is exactly
    // as exposed as a Server Action, and it hands back an entire company's footprint as a file.
    const forbidden = await request.get("/api/reports/export", {
      params: {
        companyId: fixture.victimCompanyId,
        facilityId: fixture.victimFacilityId,
        year: E2E_YEAR,
      },
    });
    expect(forbidden.status()).toBe(403);
    expect(await forbidden.json()).toEqual({ error: "forbidden" });

    // The subtler attack: send NO companyId, so the server resolves the caller to their own
    // company, then pass the victim's facilityId and hope the loader trusts it.
    const notFound = await request.get("/api/reports/export", {
      params: { facilityId: fixture.victimFacilityId, year: E2E_YEAR },
    });
    expect(notFound.status()).toBe(404);
    // "not yours" and "does not exist" must look identical from outside.
    expect(await notFound.json()).toEqual({ error: "notFound" });
  });

  test("the export route serves the caller's OWN company, so the refusals above are not vacuous", async ({
    request,
  }) => {
    // A test that only ever asserts 403 would still pass if the route were broken for everyone.
    const client = await db();
    await client.query(
      `INSERT INTO reporting_years (id, "facilityId", "companyId", year, "gwpSet", "createdAt", "updatedAt")
       VALUES (gen_random_uuid()::text, $1, $2, $3, 'AR6', now(), now())
       ON CONFLICT ("facilityId", year) DO NOTHING`,
      [fixture.facilityId, fixture.companyId, E2E_YEAR],
    );
    await client.end();

    const ok = await request.get("/api/reports/export", {
      params: { facilityId: fixture.facilityId, year: E2E_YEAR },
    });

    expect(ok.status()).toBe(200);
    expect(ok.headers()["content-type"]).toContain("spreadsheetml.sheet");
    expect(ok.headers()["content-disposition"]).toContain("attachment");
  });

  test("a foreign facility cannot be reached through the data-entry query string", async ({
    page,
  }) => {
    // The screen takes facilityId from the URL. It must fall back to the caller's own facility
    // rather than honour one it does not own.
    await page.goto(`/data-entry?facilityId=${fixture.victimFacilityId}&year=${E2E_YEAR}`);

    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.locator("body")).not.toContainText("Planta Victima");
  });

  test("a foreign facility cannot be reached through the preview or dashboard query string", async ({
    page,
  }) => {
    for (const path of ["/preview", "/dashboard"]) {
      await page.goto(`${path}?facilityId=${fixture.victimFacilityId}&year=${E2E_YEAR}`);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.locator("body")).not.toContainText("Planta Victima");
    }
  });

  test("none of the above wrote anything to the victim", async () => {
    // The assertion that makes the rest of this spec mean something. Read straight from Postgres,
    // with the app out of the loop.
    expect(await victimFacilityCount()).toBe(1);

    const client = await db();
    const company = await client.query<{ name: string }>(
      `SELECT name FROM companies WHERE id = $1`,
      [fixture.victimCompanyId],
    );
    await client.end();

    // Still there, still named what global-setup named it.
    expect(company.rows[0]?.name).toBe(fixture.victimCompanyName);
  });
});
