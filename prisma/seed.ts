import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Scope, GwpSet, Role } from "../src/lib/generated/prisma/client";
import {
  createSupabaseAdminClient,
  findAuthUserIdByEmail,
} from "../src/lib/supabase/admin";

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
  { scope: Scope.SCOPE_2, category: "Consumo de energía eléctrica", subcategory: null, element: "Electricidad (Red Nacional - SIN)", unit: "kWh", factorUnit: "kg CO2/kWh", source: "UPME/XM - factor por año (grid_electricity_factors)" },
  // Scope 3 - waste
  { scope: Scope.SCOPE_3, category: "Residuos", subcategory: "Incineración", element: "Residuos Ordinarios", unit: "kg", co2eFactor: "0.23", factorUnit: "kg CO2e/kg", source: "IPCC (starter)" },
  { scope: Scope.SCOPE_3, category: "Residuos", subcategory: "Relleno Sanitario", element: "Relleno sanitario gestionado anaeróbico", unit: "kg", co2eFactor: "1.54", factorUnit: "kg CO2e/kg", source: "IPCC (starter)" },
];

// Seed the single admin (credentials from .env.local). Idempotent.
async function seedAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  if (!url || !serviceKey || !email || !password) {
    console.warn(
      "Skipping admin seed (set SUPABASE_* and ADMIN_EMAIL/ADMIN_PASSWORD in .env.local).",
    );
    return;
  }

  const supabase = createSupabaseAdminClient();

  // Ensure the auth user exists (email_confirm skips the verification email).
  let userId: string | undefined;
  const { data: created } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (created?.user) {
    userId = created.user.id;
  } else {
    // Already exists - find it and keep the password in sync with .env.local.
    userId = await findAuthUserIdByEmail(supabase, email);
    if (userId) {
      await supabase.auth.admin.updateUserById(userId, {
        password,
        email_confirm: true,
      });
    }
  }

  if (!userId) {
    console.warn("Admin seed: could not resolve the auth user id.");
    return;
  }

  // Force the profile role to CECODES_ADMIN (the signup trigger defaults to COMPANY_USER).
  await prisma.appUser.upsert({
    where: { id: userId },
    update: { role: Role.CECODES_ADMIN, email },
    create: { id: userId, email, role: Role.CECODES_ADMIN },
  });

  console.log(`Admin ✓  ${email}`);
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
