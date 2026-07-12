import { mkdirSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import {
  E2E_COMPANY_PREFIX,
  E2E_EMAIL_DOMAIN,
  E2E_PASSWORD,
  E2E_YEAR,
  FIXTURE_PATH,
  db,
  purgeE2E,
  supabaseAdmin,
  type Fixture,
} from "./fixture";

async function createAuthUser(email: string): Promise<string> {
  const { data, error } = await supabaseAdmin().auth.admin.createUser({
    email,
    password: E2E_PASSWORD,
    email_confirm: true,
  });
  if (error || !data.user) {
    throw new Error(`E2E: could not create auth user ${email}. ${error?.message}`);
  }
  return data.user.id;
}

// The seeded CECODES admin has no company of its own, so it cannot drive the company-user
// data-entry flow. The suite provisions its own throwaway tenant instead, plus its own
// throwaway admin, and removes both in teardown. Nothing outside the "E2E " namespace is
// ever touched.
//
// The admin is disposable on purpose: the admin specs deactivate and delete accounts, and
// doing that to the real seeded admin would lock the project out of its own database.
export default async function globalSetup() {
  const client = await db();

  // Recover from a run that crashed before teardown.
  await purgeE2E(client);

  const suffix = randomUUID().slice(0, 8);
  const companyName = `${E2E_COMPANY_PREFIX}${suffix}`;
  const email = `e2e-${suffix}@${E2E_EMAIL_DOMAIN}`;
  const adminEmail = `e2e-admin-${suffix}@${E2E_EMAIL_DOMAIN}`;

  const userId = await createAuthUser(email);
  const adminUserId = await createAuthUser(adminEmail);

  const company = await client.query<{ id: string }>(
    `INSERT INTO companies (id, name, sector, "createdAt", "updatedAt")
     VALUES (gen_random_uuid()::text, $1, 'E2E', now(), now()) RETURNING id`,
    [companyName],
  );
  const companyId = company.rows[0].id;

  const facility = await client.query<{ id: string }>(
    `INSERT INTO facilities (id, "companyId", name, location, "createdAt", "updatedAt")
     VALUES (gen_random_uuid()::text, $1, 'Planta E2E', 'Bogotá, Colombia', now(), now())
     RETURNING id`,
    [companyId],
  );

  // The auth trigger creates the app_users row; the upsert covers the case where it has not
  // landed yet, and links the user to the throwaway company.
  await client.query(
    `INSERT INTO app_users (id, email, role, "companyId", "createdAt", "updatedAt")
     VALUES ($1, $2, 'COMPANY_USER', $3, now(), now())
     ON CONFLICT (id) DO UPDATE SET "companyId" = EXCLUDED."companyId", role = 'COMPANY_USER'`,
    [userId, email, companyId],
  );

  // An admin owns no company: companyId stays null. The trigger defaults the role to
  // COMPANY_USER, so it must be forced here.
  await client.query(
    `INSERT INTO app_users (id, email, role, "companyId", "createdAt", "updatedAt")
     VALUES ($1, $2, 'CECODES_ADMIN', NULL, now(), now())
     ON CONFLICT (id) DO UPDATE SET role = 'CECODES_ADMIN', "companyId" = NULL`,
    [adminUserId, adminEmail],
  );

  // A SECOND company, with a facility and a reporting year, which nobody signs in as. It exists
  // only so the cross-tenant spec has real ids to attack with. Proving isolation against ids that
  // do not exist proves nothing: "not found" and "not yours" must be indistinguishable to the
  // caller, and only a real foreign row can tell the two apart.
  const victimName = `${E2E_COMPANY_PREFIX}victima ${suffix}`;
  const victim = await client.query<{ id: string }>(
    `INSERT INTO companies (id, name, sector, "createdAt", "updatedAt")
     VALUES (gen_random_uuid()::text, $1, 'E2E', now(), now()) RETURNING id`,
    [victimName],
  );
  const victimCompanyId = victim.rows[0].id;

  const victimFacility = await client.query<{ id: string }>(
    `INSERT INTO facilities (id, "companyId", name, location, "createdAt", "updatedAt")
     VALUES (gen_random_uuid()::text, $1, 'Planta Victima', 'Medellín, Colombia', now(), now())
     RETURNING id`,
    [victimCompanyId],
  );
  const victimFacilityId = victimFacility.rows[0].id;

  const victimYear = await client.query<{ id: string }>(
    `INSERT INTO reporting_years (id, "facilityId", "companyId", year, "gwpSet", "createdAt", "updatedAt")
     VALUES (gen_random_uuid()::text, $1, $2, $3, 'AR6', now(), now()) RETURNING id`,
    [victimFacilityId, victimCompanyId, E2E_YEAR],
  );

  const fixture: Fixture = {
    email,
    companyId,
    companyName,
    facilityId: facility.rows[0].id,
    userId,
    adminEmail,
    adminUserId,

    victimCompanyId,
    victimCompanyName: victimName,
    victimFacilityId,
    victimReportingYearId: victimYear.rows[0].id,
  };

  mkdirSync("e2e/.auth", { recursive: true });
  writeFileSync(FIXTURE_PATH, JSON.stringify(fixture, null, 2));
  await client.end();
}
