import { randomUUID } from "node:crypto";
import { db, supabaseAdmin, E2E_PASSWORD, E2E_COMPANY_PREFIX, E2E_EMAIL_DOMAIN } from "../e2e/fixture";

async function main() {
  const client = await db();
  const suffix = randomUUID().slice(0, 8);
  const email = `phase3-check-${suffix}@${E2E_EMAIL_DOMAIN}`;
  const adminEmail = `phase3-admin-${suffix}@${E2E_EMAIL_DOMAIN}`;
  const companyName = `${E2E_COMPANY_PREFIX}phase3-check-${suffix}`;

  const { data, error } = await supabaseAdmin().auth.admin.createUser({
    email, password: E2E_PASSWORD, email_confirm: true,
  });
  if (error || !data.user) throw new Error(`could not create user: ${error?.message}`);
  const userId = data.user.id;

  const { data: adminData, error: adminError } = await supabaseAdmin().auth.admin.createUser({
    email: adminEmail, password: E2E_PASSWORD, email_confirm: true,
  });
  if (adminError || !adminData.user) throw new Error(`could not create admin user: ${adminError?.message}`);
  const adminUserId = adminData.user.id;

  const company = await client.query<{ id: string }>(
    `INSERT INTO companies (id, name, sector, "createdAt", "updatedAt")
     VALUES (gen_random_uuid()::text, $1, 'E2E', now(), now()) RETURNING id`,
    [companyName],
  );
  const companyId = company.rows[0].id;
  const facility = await client.query<{ id: string }>(
    `INSERT INTO facilities (id, "companyId", name, location, "createdAt", "updatedAt")
     VALUES (gen_random_uuid()::text, $1, 'Planta Phase3', 'Bogotá, Colombia', now(), now())
     RETURNING id`,
    [companyId],
  );
  const facilityId = facility.rows[0].id;
  await client.query(
    `INSERT INTO app_users (id, email, role, "companyId", "createdAt", "updatedAt")
     VALUES ($1, $2, 'COMPANY_USER', $3, now(), now())
     ON CONFLICT (id) DO UPDATE SET "companyId" = EXCLUDED."companyId", role = 'COMPANY_USER'`,
    [userId, email, companyId],
  );
  await client.query(
    `INSERT INTO app_users (id, email, role, "companyId", "createdAt", "updatedAt")
     VALUES ($1, $2, 'CECODES_ADMIN', NULL, now(), now())
     ON CONFLICT (id) DO UPDATE SET role = 'CECODES_ADMIN', "companyId" = NULL`,
    [adminUserId, adminEmail],
  );
  const year = await client.query<{ id: string }>(
    `INSERT INTO reporting_years (id, "facilityId", "companyId", year, "gwpSet", "createdAt", "updatedAt")
     VALUES (gen_random_uuid()::text, $1, $2, 2024, 'AR6', now(), now()) RETURNING id`,
    [facilityId, companyId],
  );

  console.log(JSON.stringify({
    email, adminEmail, password: E2E_PASSWORD, companyId, facilityId, yearId: year.rows[0].id,
  }));
  await client.end();
}
main();
