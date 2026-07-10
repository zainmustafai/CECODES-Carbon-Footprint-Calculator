import { mkdirSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import {
  E2E_COMPANY_PREFIX,
  E2E_EMAIL_DOMAIN,
  E2E_PASSWORD,
  FIXTURE_PATH,
  db,
  purgeE2E,
  supabaseAdmin,
  type Fixture,
} from "./fixture";

// The seeded CECODES admin has no company of its own, so it cannot drive the company-user
// data-entry flow. The suite provisions its own throwaway tenant instead, and removes it in
// teardown. Nothing outside the "E2E " namespace is ever touched.
export default async function globalSetup() {
  const client = await db();

  // Recover from a run that crashed before teardown.
  await purgeE2E(client);

  const suffix = randomUUID().slice(0, 8);
  const companyName = `${E2E_COMPANY_PREFIX}${suffix}`;
  const email = `e2e-${suffix}@${E2E_EMAIL_DOMAIN}`;

  const { data, error } = await supabaseAdmin().auth.admin.createUser({
    email,
    password: E2E_PASSWORD,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`E2E: could not create auth user. ${error?.message}`);
  const userId = data.user.id;

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

  const fixture: Fixture = {
    email,
    companyId,
    companyName,
    facilityId: facility.rows[0].id,
    userId,
  };

  mkdirSync("e2e/.auth", { recursive: true });
  writeFileSync(FIXTURE_PATH, JSON.stringify(fixture, null, 2));
  await client.end();
}
