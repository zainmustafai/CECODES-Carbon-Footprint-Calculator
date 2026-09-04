import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Scope, GwpSet, Role } from "../src/lib/generated/prisma/client";
import { hashPassword, verifyPassword } from "../src/lib/auth/password";
import { generateTempPassword } from "../src/lib/generate-password";
import { datasourceUrl } from "../scripts/datasource";

// Seed starter reference data. Safe to re-run (idempotent).
// The full emission-factor library is loaded separately once CECODES confirms the dataset.
const adapter = new PrismaPg({ connectionString: datasourceUrl() });
const prisma = new PrismaClient({ adapter });

// Scope-2 national grid factor (SIN) by year - kg CO2 / kWh (source: UPME/XM). Req. §7.3
const gridFactors = [
  { year: 2013, factor: "0.2" },
  { year: 2019, factor: "0.17" },
  { year: 2021, factor: "0.126378" },
  { year: 2022, factor: "0.1123708" },
  { year: 2023, factor: "0.1728" },
  { year: 2024, factor: "0.217" },
];

// Emission-factor library version history (from the Excel "Control de Cambios").
const versions = [
  {
    version: "v001",
    date: new Date("2024-12-19"),
    preparedBy: "Sebastian Gómez",
    reviewedBy: "Angélica Atencio",
    authorizedBy: "Danna Lasso",
    description:
      "Registro de factores de emisión usados en la herramienta de huella de carbono de CECODES durante 2024.",
  },
  {
    version: "v002",
    date: new Date("2025-05-20"),
    preparedBy: "Sebastian Gómez",
    reviewedBy: "Angélica Atencio",
    authorizedBy: "Danna Lasso",
    description:
      "Se agregó el factor de emisión por consumo de energía eléctrica para el año 2024.",
  },
  {
    version: "v003",
    date: new Date("2025-06-27"),
    preparedBy: "Sebastian Gómez",
    reviewedBy: "Angélica Atencio",
    authorizedBy: "Danna Lasso",
    description: "Actualización de jerarquía de categorías y elementos.",
  },
  {
    version: "v004",
    date: new Date("2025-07-14"),
    preparedBy: "Sebastian Gómez",
    reviewedBy: "Angélica Atencio",
    authorizedBy: "Danna Lasso",
    description: null,
  },
  {
    version: "v005",
    date: new Date("2025-10-21"),
    preparedBy: "Sebastian Gómez",
    reviewedBy: "Angélica Atencio",
    authorizedBy: "Danna Lasso",
    description:
      "Ajuste de valores incorrectos de C6 y C7; corrección FE CO2 para aceites lubricantes; corrección de alcance para SF6; renombrado 'cascarilla de arroz' (fijo).",
  },
];

// STARTER emission-factor subset (representative, from the Excel analysis) so the app
// has data to render. Replace with CECODES's confirmed full dataset via the importer.
const starterEmissionFactors = [
  // Scope 1 - stationary combustion
  { scope: Scope.SCOPE_1, category: "Fuentes Fijas", subcategory: "Combustibles Sólidos", element: "Carbón Genérico", unit: "ton", co2Factor: "2534.813", factorUnit: "kg CO2/ton", source: "FECOC 2016 (starter)" },
  { scope: Scope.SCOPE_1, category: "Fuentes Fijas", subcategory: "Combustibles Sólidos", element: "Bagazo", unit: "ton", co2Factor: "1664.917", biogenic: true, factorUnit: "kg CO2/ton", source: "FECOC 2016 (starter)" },
  { scope: Scope.SCOPE_1, category: "Fuentes Fijas", subcategory: "Combustibles Líquidos", element: "Diésel o ACPM (B2) - Fijo", unit: "gal", co2Factor: "10.149", factorUnit: "kg CO2/gal", source: "FECOC 2016 (starter)" },
  { scope: Scope.SCOPE_1, category: "Fuentes Fijas", subcategory: "Combustibles Gaseosos", element: "Gas Natural Genérico - Fijo", unit: "m3", co2Factor: "1.9806", factorUnit: "kg CO2/m3", source: "FECOC 2016 (starter)" },
  // Scope 1 - mobile combustion
  { scope: Scope.SCOPE_1, category: "Fuentes Móviles", subcategory: "Combustibles Líquidos", element: "Diésel o ACPM - Móvil", unit: "gal", co2Factor: "10.149", ch4Factor: "0.037", n2oFactor: "0.037", gwpSet: GwpSet.AR6, factorUnit: "kg/gal", source: "IPCC/FECOC (starter)" },
  { scope: Scope.SCOPE_1, category: "Fuentes Móviles", subcategory: "Combustibles Líquidos", element: "Gasolina Motor - Móvil", unit: "gal", co2Factor: "8.8085", ch4Factor: "2.926", n2oFactor: "0.037", gwpSet: GwpSet.AR6, factorUnit: "kg/gal", source: "IPCC/FECOC (starter)" },
  // Scope 1 - fugitive (refrigerants / SF6 / extinguishers), CO2e already embedded
  { scope: Scope.SCOPE_1, category: "Emisiones Fugitivas", subcategory: "Fugas de refrigerantes", element: "Fugas de HCFC-22 / R-22", unit: "kg", co2eFactor: "1960", gwpSet: GwpSet.AR6, factorUnit: "kg CO2e/kg", source: "IPCC AR6 (starter)" },
  { scope: Scope.SCOPE_1, category: "Emisiones Fugitivas", subcategory: "Consumo de aislante SF6", element: "Uso de SF6", unit: "kg", co2eFactor: "25200", gwpSet: GwpSet.AR6, factorUnit: "kg CO2e/kg", source: "IPCC (starter)" },
  { scope: Scope.SCOPE_1, category: "Emisiones Fugitivas", subcategory: "Uso de extintores", element: "Extintores CO2", unit: "kg", co2eFactor: "1", factorUnit: "kg CO2/kg", source: "IPCC (starter)" },
  // Scope 2 - grid electricity (factor comes from grid_electricity_factors by year)
  { scope: Scope.SCOPE_2, category: "Consumo de energía eléctrica", subcategory: null, element: "SISTEMA INTERCONECTADO NACIONAL - SIN", unit: "kWh", factorUnit: "kg CO2/kWh", source: "UPME/XM - factor por año (grid_electricity_factors)" },
  // Scope 2 - electricity backed by renewable-energy certificates. The ONE Alcance 2 row in
  // CECODES's library that is not a year (their "Energía eléctrica adquirida respaldada con RECs
  // (cualquier año)", value 0, unit kgCO2e/kWh), which the importer therefore cannot route into
  // grid_electricity_factors and reports as pending. It lives here instead, in the same category
  // as the grid element so Alcance 2 stays one picker with two elements.
  //
  // The explicit "0" is load-bearing: rollupYear's scope2RatePerKwh reads an entry's own per-kWh
  // factor in preference to the year's grid factor, so this is what makes REC-backed consumption
  // price at zero instead of being charged full grid emissions. Requirements 12.13.
  { scope: Scope.SCOPE_2, category: "Consumo de energía eléctrica", subcategory: null, element: "Energía eléctrica adquirida respaldada con RECs", unit: "kWh", co2eFactor: "0", factorUnit: "kg CO2e/kWh", source: "CECODES - Emission Factors (debe coincidir con REC)" },
  // Scope 3 - waste
  { scope: Scope.SCOPE_3, category: "Residuos", subcategory: "Incineración", element: "Residuos Ordinarios", unit: "kg", co2eFactor: "0.23", factorUnit: "kg CO2e/kg", source: "IPCC (starter)" },
  { scope: Scope.SCOPE_3, category: "Residuos", subcategory: "Relleno Sanitario", element: "Relleno sanitario gestionado anaeróbico", unit: "kg", co2eFactor: "1.54", factorUnit: "kg CO2e/kg", source: "IPCC (starter)" },
];

// Seed the single admin (credentials from .env.local). Idempotent.
async function seedAdmin() {
  // Folded, and this is not cosmetic. app_users.email is unique and case SENSITIVE, and every
  // reader folds before it looks a row up: signInAction normalizes the address it was given. An
  // ADMIN_EMAIL carrying a capital would otherwise produce the one row no sign-in can ever reach,
  // on the one account that is the only way into the app.
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  // "" reads as unset, the same rule env.ts's optionalVar applies: an operator turning this off
  // empties the line rather than deleting it, and docker compose passes that through as "".
  const rawPassword = process.env.ADMIN_PASSWORD?.trim();

  // Fail loudly on a missing email. This used to warn and return, so `db:seed` exited 0 with no
  // admin created - a deployment could report success while nobody on earth could log in. There
  // is no self-serve registration (FEATURE_SELF_ONBOARDING is false), so the seeded admin is the
  // ONLY way in. ADMIN_PASSWORD no longer belongs in this check: an unset password now means
  // "generate one", handled below.
  //
  // SEED_SKIP_ADMIN=true is the deliberate escape for local work against a database whose admin
  // already exists; it has to be typed on purpose, which is the point.
  if (!email) {
    if (process.env.SEED_SKIP_ADMIN === "true") {
      console.warn("Admin seed skipped: SEED_SKIP_ADMIN=true was set explicitly.");
      return;
    }
    throw new Error(
      `Cannot seed the admin account. Missing: ADMIN_EMAIL.\n` +
        `Without an admin there is no way to sign in, because self-serve registration is off.\n` +
        `Set this in .env.local, or set SEED_SKIP_ADMIN=true if you know one already exists.`,
    );
  }

  const existing = await prisma.appUser.findUnique({
    where: { email },
    select: { id: true, emailConfirmedAt: true, passwordHash: true, passwordAlgo: true },
  });

  // The only signal the banner below is allowed to fire on: this run is what brings the row into
  // existence, not a later restart that merely finds it again.
  const created = !existing;
  const id = existing?.id ?? randomUUID();

  // Recorded once and never moved. Nobody is mailed a link here - the password comes from
  // .env.local (or is generated below) and the account works the moment it exists - so the
  // timestamp says when that happened. Rewriting it on every run would overwrite the confirmation
  // date the credential backfill carried across from GoTrue with the date of the last seed.
  const emailConfirmedAt = existing?.emailConfirmedAt ?? new Date();

  // ADMIN_PASSWORD unset means "generate one". This is the single place in the codebase allowed
  // to print a credential, and it is a deliberate exception: the alternative is a fixed default
  // admin password, which on a public VPS is a backdoor. It fires only when the variable is
  // unset, only when the admin does not already exist, and prints once (see the banner below).
  const generated = created && !rawPassword;

  if (!rawPassword && !created) {
    // No password to apply, and an admin that already exists. Regenerating one here on every
    // restart would silently invalidate the previous run's credential (generated or typed) with
    // nothing printed to explain it, which is worse than leaving the stored hash exactly as it
    // is. Role and email confirmation still get enforced, same as the branch below.
    await prisma.appUser.update({
      where: { id },
      data: { role: Role.CECODES_ADMIN, email, emailConfirmedAt },
    });
    console.log("Admin ✓  (password unchanged, ADMIN_PASSWORD not set)");
    return;
  }

  const adminPassword = rawPassword ?? generateTempPassword(24);

  // Hashed unconditionally: app_users.passwordHash IS the credential now, there being no other
  // store for it to defer to.
  const { hash, algo } = await hashPassword(adminPassword);

  // Whether the password already stored is the one now in force, asked before anything is
  // written. A freshly generated password never matches an existing hash, so this only ever
  // short-circuits the ADMIN_PASSWORD-set path below; the created path has no existing hash to
  // compare against and always writes.
  //
  // This runs on EVERY container start (scripts/init-db.ts step 4), and app_users.passwordHash IS
  // the credential, there being no other store for it to defer to. So an unconditional rewrite
  // meant a restart silently reissued the admin's password from .env, and, worse, it was the one
  // password write in the codebase that did not retire what the old password
  // had minted: compare user-actions.ts resetUserPassword and auth-actions.ts
  // updatePasswordLocally, both of which treat "the password changed" and "the old credentials are
  // dead" as a single statement.
  //
  // Reverting to .env stays deliberate: on a self-hosted box .env is how an operator recovers an
  // admin account nobody can get into, and taking that away would leave no way back. What changes
  // is that the revert is now honest about being one.
  const alreadyCurrent =
    !created && (await verifyPassword(adminPassword, existing?.passwordHash, existing?.passwordAlgo));

  // Force the profile role to CECODES_ADMIN (an existing row may predate this seed and hold the
  // default COMPANY_USER role).
  await prisma.$transaction(async (tx) => {
    await tx.appUser.upsert({
      where: { id },
      update: {
        role: Role.CECODES_ADMIN,
        email,
        passwordHash: hash,
        passwordAlgo: algo,
        emailConfirmedAt,
      },
      create: {
        id,
        email,
        role: Role.CECODES_ADMIN,
        passwordHash: hash,
        passwordAlgo: algo,
        emailConfirmedAt,
      },
    });

    // Only when the password actually moved. A restart that changed nothing must not sign the
    // admin out of the browser they left open, which is the ordinary case and would otherwise
    // happen on every single `docker compose up`.
    if (existing && !alreadyCurrent) {
      await tx.userSession.deleteMany({ where: { userId: id } });
      await tx.passwordResetToken.deleteMany({ where: { userId: id } });
    }
  });

  if (generated && created) {
    // The one documented exception to this project's rule against printing credentials. A fixed
    // default admin password on a public VPS is a backdoor; a generated one printed once to a log
    // the operator must already read (docker compose logs init) is not. Guarded so it can only
    // ever fire on the run that creates the row, never on a later restart that merely finds it.
    console.log("");
    console.log("  ============================================================");
    console.log("   ADMIN ACCOUNT CREATED");
    console.log(`   email:    ${email}`);
    console.log(`   password: ${adminPassword}`);
    console.log("   Sign in and change this now. It is not shown again.");
    console.log("   Set ADMIN_PASSWORD in .env to choose your own instead.");
    console.log("  ============================================================");
    console.log("");
    return;
  }

  // ADMIN_EMAIL used to be printed here. Seed output is exactly the sort of text that gets pasted
  // into a chat window to show a deployment worked, and the address belongs to a real person.
  console.log(
    `Admin ✓${
      existing && !alreadyCurrent ? "  (password reset from ADMIN_PASSWORD, sessions ended)" : ""
    }`,
  );
}

/**
 * Ensure the Alcance 2 "backed by RECs" element exists, whatever else the library holds.
 *
 * This runs UNCONDITIONALLY, unlike the starter subset above, and that is the point. The starter
 * list is skipped the moment the library is non-empty, so on any database that has had a real
 * import - which is every deployed one - adding this row to that list would deliver nothing.
 *
 * It cannot come from the importer either: prisma/import-factors.ts routes Alcance 2 rows into
 * grid_electricity_factors keyed by the year in the element name, and this is the one row in
 * CECODES's library with no year ("cualquier año"), which the importer logs as GRID PENDING.
 *
 * So it is seeded, once, here. Idempotent by the same natural key the expression index enforces
 * (scope, category, subcategory, element, unit); an existing row is left exactly as it is, so an
 * admin who later edits the value keeps their edit.
 */
async function ensureRecElectricityFactor(): Promise<void> {
  const key = {
    scope: Scope.SCOPE_2,
    category: "Consumo de energía eléctrica",
    subcategory: null,
    element: "Energía eléctrica adquirida respaldada con RECs",
    unit: "kWh",
  };
  const existing = await prisma.emissionFactor.findFirst({ where: key, select: { id: true } });
  if (existing) return;

  const latest = await prisma.emissionFactorVersion.findFirst({ orderBy: { date: "desc" } });
  await prisma.emissionFactor.create({
    data: {
      ...key,
      co2eFactor: "0",
      factorUnit: "kg CO2e/kWh",
      source: "CECODES - Emission Factors (debe coincidir con REC)",
      versionId: latest?.id,
    },
  });
  console.log("Seeded the Alcance 2 RECs element (0 kg CO2e/kWh).");
}

async function main() {
  // Create only, NEVER update. A CECODES admin may have resolved a conflict between this seeded
  // value and their workbook (see resolveGridFactor in factor-actions.ts); re-running the seed must
  // not silently revert that decision and drop the updatedByEmail stamp that records who made it.
  // The importer already refuses to overwrite grid factors for the same reason: it reports the
  // conflict (GRID WARN) and leaves the resolution to a human. This is what CLIENT_DECISION_MEMO
  // item 5 promises CECODES: "never overwrites these silently".
  //
  // Correcting a seeded value is therefore an admin action, not a seed rerun. To change a value
  // here, change it in the admin UI; edit this list only for years that do not exist yet.
  await prisma.gridElectricityFactor.createMany({
    data: gridFactors.map((g) => ({
      year: g.year,
      factor: g.factor,
      source: "UPME/XM (SIN)",
    })),
    skipDuplicates: true,
  });

  for (const v of versions) {
    const existing = await prisma.emissionFactorVersion.findFirst({
      where: { version: v.version },
    });
    if (!existing) await prisma.emissionFactorVersion.create({ data: v });
  }

  // Emission factors: seed the STARTER subset only when the library is empty
  // (so a real import is never overwritten). Linked to the latest version.
  if ((await prisma.emissionFactor.count()) === 0) {
    const latest = await prisma.emissionFactorVersion.findFirst({
      orderBy: { date: "desc" },
    });
    await prisma.emissionFactor.createMany({
      data: starterEmissionFactors.map((f) => ({ ...f, versionId: latest?.id })),
    });
  }

  await ensureRecElectricityFactor();

  await seedAdmin();

  const gf = await prisma.gridElectricityFactor.count();
  const vv = await prisma.emissionFactorVersion.count();
  const ef = await prisma.emissionFactor.count();
  const admins = await prisma.appUser.count({ where: { role: Role.CECODES_ADMIN } });
  console.log(
    `Seeded ✓  grid factors=${gf}  factor versions=${vv}  emission factors=${ef}  admins=${admins}`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
