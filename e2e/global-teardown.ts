import { rmSync } from "node:fs";
import { db, purgeE2E } from "./fixture";

// Sweeps the ENTIRE "E2E " namespace, not just the fixture company.
//
// The admin specs create their own companies ("E2E Empresa <uuid>"), factors, versions and
// grid years. Passing purgeE2E a single companyId would narrow the sweep to the fixture
// tenant and leave everything else behind in a shared database.
export default async function globalTeardown() {
  const client = await db();
  await purgeE2E(client);
  await client.end();

  rmSync("e2e/.auth", { recursive: true, force: true });
}
