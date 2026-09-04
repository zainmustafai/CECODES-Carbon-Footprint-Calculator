import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Scope, GwpSet, Role } from "../src/lib/generated/prisma/client";
import { hashPassword, verifyPassword } from "../src/lib/auth/password";

// Seed starter reference data. Safe to re-run (idempotent).
// The full emission-factor library is loaded separately once CECODES confirms the dataset.
const adapter = new PrismaPg({
  connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
});
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
  const password = process.env.ADMIN_PASSWORD;

  // Fail loudly. This used to warn and return, so `db:seed` exited 0 with no admin created - a
  // deployment could report success while nobody on earth could log in. There is no self-serve
  // registration (FEATURE_SELF_ONBOARDING is false), so the seeded admin is the ONLY way in.
  //
  // SEED_SKIP_ADMIN=true is the deliberate escape for local work against a database whose admin
  // already exists; it has to be typed on purpose, which is the point.
  if (!email || !password) {
    if (process.env.SEED_SKIP_ADMIN === "true") {
      console.warn("Admin seed skipped: SEED_SKIP_ADMIN=true was set explicitly.");
      return;
    }
    const missing = [!email && "ADMIN_EMAIL", !password && "ADMIN_PASSWORD"].filter(Boolean);
    throw new Error(
      `Cannot seed the admin account. Missing: ${missing.join(", ")}.\n` +
        `Without an admin there is no way to sign in, because self-serve registration is off.\n` +
        `Set these in .env.local, or set SEED_SKIP_ADMIN=true if you know one already exists.`,
    );
  }

  // Hashed unconditionally: app_users.passwordHash IS the credential now, there being no other
  // store for it to defer to.
  const { hash, algo } = await hashPassword(password);

  const existing = await prisma.appUser.findUnique({
    where: { email },
    select: { id: true, emailConfirmedAt: true, passwordHash: true, passwordAlgo: true },
  });

  const id = existing?.id ?? randomUUID();

  // Recorded once and never moved. Nobody is mailed a link here - the password comes from
  // .env.local and the account works the moment it exists - so the timestamp says when that
  // happened. Rewriting it on every run would overwrite the confirmation date the credential
  // backfill carried across from GoTrue with the date of the last seed.
  const emailConfirmedAt = existing?.emailConfirmedAt ?? new Date();

  // Whether ADMIN_PASSWORD is already the stored password, asked before anything is written.
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
  const alreadyCurrent = await verifyPassword(password, existing?.passwordHash, existing?.passwordAlgo);

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

  // ADMIN_EMAIL used to be printed here. Seed output is exactly the sort of text that gets pasted
  // into a chat window to show a deployment worked, and the address belongs to a real person.
  console.log(
    `Admin ✓${
      existing && !alreadyCurrent ? "  (password reset from ADMIN_PASSWORD, sessions ended)" : ""
    }`,
  );
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
