import { loadEnvConfig } from "@next/env";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  PrismaClient,
  Role,
  Scope,
  type EmissionFactor,
} from "../src/lib/generated/prisma/client";
import {
  createSupabaseAdminClient,
  findAuthUserIdByEmail,
} from "../src/lib/supabase/admin";
import { resolveGwpSet } from "../src/lib/gwp";

// Demo tenants for manual QA and for showing the tool to CECODES.
//
//   bun run db:seed:demo
//
// This is NOT part of `db:seed`. The production seed stays reference data plus the admin.
//
// PRODUCTION BRAKE: there is exactly one shared Supabase database, so the only thing standing
// between this script and real customer data is the DEMO_SEED_ALLOWED env var. It lives in
// .env.local and must never be set in a deployed environment.
//
// Idempotent: re-running it converges rather than duplicating.

loadEnvConfig(process.cwd());

const adapter = new PrismaPg({
  connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });

const DEMO_EMAIL_DOMAIN = "demo.cecodes.invalid";
const FULL_COMPANY = "Demo Alimentos del Valle";
const EMPTY_COMPANY = "Demo Empresa Vacia";

type SourceSpec = {
  scope: Scope;
  /** Matched case-insensitively against the live factor library. */
  categoryContains?: string;
  elementContains: string;
  /** One value for an annual source; twelve (or fewer) for a Scope 2 monthly source. */
  monthlyValues?: (string | null)[];
  annualValue?: string;
};

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing ${name}. Set it in .env.local.`);
    process.exit(1);
  }
  return value;
}

function guard(): string {
  if (process.env.DEMO_SEED_ALLOWED !== "true") {
    console.error(
      "Refusing to run. Set DEMO_SEED_ALLOWED=true in .env.local.\n" +
        "This writes demo companies into the shared database and must never run in production.",
    );
    process.exit(1);
  }
  return requireEnv("DEMO_PASSWORD");
}

// Resolve a factor from the LIVE library rather than hardcoding ids or exact names. The
// library is replaced wholesale by prisma/import-factors.ts, so any hardcoded element name
// would break the moment the real dataset lands.
async function pickFactor(spec: SourceSpec): Promise<EmissionFactor | null> {
  return prisma.emissionFactor.findFirst({
    where: {
      scope: spec.scope,
      active: true,
      element: { contains: spec.elementContains, mode: "insensitive" },
      ...(spec.categoryContains
        ? { category: { contains: spec.categoryContains, mode: "insensitive" } }
        : {}),
    },
    orderBy: { element: "asc" },
  });
}

async function upsertAuthUser(email: string, password: string): Promise<string | null> {
  const supabase = createSupabaseAdminClient();

  const { data: created } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (created?.user) return created.user.id;

  // Already exists: keep the password in step with .env.local so the documented
  // credentials always work.
  const existingId = await findAuthUserIdByEmail(supabase, email);
  if (!existingId) return null;
  await supabase.auth.admin.updateUserById(existingId, { password, email_confirm: true });
  return existingId;
}

async function upsertCompanyUser(
  email: string,
  password: string,
  companyId: string | null,
): Promise<void> {
  const userId = await upsertAuthUser(email, password);
  if (!userId) {
    console.warn(`  ! could not resolve an auth user for ${email}`);
    return;
  }

  // The signup trigger may have created the row already. It never updates, so force the link.
  await prisma.appUser.upsert({
    where: { id: userId },
    update: { email, role: Role.COMPANY_USER, companyId, active: true },
    create: { id: userId, email, role: Role.COMPANY_USER, companyId, active: true },
  });
}

async function findOrCreateCompany(
  name: string,
  data: { sector?: string; contactEmail?: string },
): Promise<string> {
  const existing = await prisma.company.findFirst({ where: { name }, select: { id: true } });
  if (existing) {
    await prisma.company.update({ where: { id: existing.id }, data: { ...data, active: true } });
    return existing.id;
  }
  const created = await prisma.company.create({ data: { name, ...data } });
  return created.id;
}

async function upsertFacility(companyId: string, name: string, location: string) {
  return prisma.facility.upsert({
    where: { companyId_name: { companyId, name } },
    update: { location },
    create: { companyId, name, location },
  });
}

async function upsertReportingYear(facilityId: string, companyId: string, year: number) {
  return prisma.reportingYear.upsert({
    where: { facilityId_year: { facilityId, year } },
    update: {},
    create: { facilityId, companyId, year, gwpSet: resolveGwpSet(year) },
  });
}

// Create the entry rows for one source exactly the way addSource does: eagerly, one row per
// month for Scope 2 and a single annual row otherwise. A null value means "not reported yet",
// which is what produces an honest "8 de 12 meses".
async function seedSource(
  reportingYearId: string,
  companyId: string,
  factor: EmissionFactor,
  spec: SourceSpec,
): Promise<void> {
  const months: (number | null)[] =
    factor.scope === Scope.SCOPE_2 ? Array.from({ length: 12 }, (_, i) => i + 1) : [null];

  for (const [index, month] of months.entries()) {
    const value =
      factor.scope === Scope.SCOPE_2
        ? (spec.monthlyValues?.[index] ?? null)
        : (spec.annualValue ?? null);

    const existing = await prisma.activityEntry.findFirst({
      where: { reportingYearId, emissionFactorId: factor.id, month },
      select: { id: true },
    });

    if (existing) {
      await prisma.activityEntry.update({ where: { id: existing.id }, data: { value } });
      continue;
    }

    await prisma.activityEntry.create({
      data: {
        reportingYearId,
        companyId,
        emissionFactorId: factor.id,
        scope: factor.scope,
        category: factor.category,
        subcategory: factor.subcategory,
        element: factor.element,
        unit: factor.unit,
        month,
        value,
      },
    });
  }
}

// A plausible, varied monthly electricity profile. Not random: the seed must be idempotent
// and reproducible, and Math.random() would make two runs disagree.
function monthlyKwh(base: number, reportedMonths: number): (string | null)[] {
  const swing = [0, 4200, -3100, 2600, -1800, 5200, -900, 3300, -2400, 6100, -1500, 2000];
  return Array.from({ length: 12 }, (_, i) =>
    i < reportedMonths ? String(base + swing[i]) : null,
  );
}

async function seedFullCompany(password: string): Promise<void> {
  console.log(`\n${FULL_COMPANY}`);

  const companyId = await findOrCreateCompany(FULL_COMPANY, {
    sector: "agroindustria-alimentos",
    contactEmail: `sostenibilidad@${DEMO_EMAIL_DOMAIN}`,
  });

  const yumbo = await upsertFacility(companyId, "Planta Yumbo", "Yumbo, Valle del Cauca");
  const bogota = await upsertFacility(companyId, "Sede Bogota", "Bogota D.C.");

  const yumbo2023 = await upsertReportingYear(yumbo.id, companyId, 2023);
  const yumbo2024 = await upsertReportingYear(yumbo.id, companyId, 2024);
  const bogota2023 = await upsertReportingYear(bogota.id, companyId, 2023);
  const bogota2024 = await upsertReportingYear(bogota.id, companyId, 2024);

  // Clear the years' entries first, so a source removed from the spec (a factor corrected or
  // dropped between runs) disappears rather than lingering. Re-seeding below is deterministic,
  // so this keeps the demo a faithful mirror of the current spec on every run.
  await prisma.activityEntry.deleteMany({
    where: {
      reportingYearId: {
        in: [yumbo2023.id, yumbo2024.id, bogota2023.id, bogota2024.id],
      },
    },
  });

  // Scope 1 and 3 annual sources, plus Scope 2 monthly. Every element is resolved from the
  // live library; when the confirmed dataset renames something, the lookup simply misses and
  // the script says so rather than inventing data.
  // The element substrings are deliberately specific. "Diesel" alone also matches
  // "Biodiesel palma", and the accented "Diésel" is what the library actually stores.
  //
  // The Scope 3 waste source names the imported "C5: Residuos generados en operaciones"
  // category. The starter library called it plain "Residuos"; that row is deactivated once
  // the real dataset lands, and pickFactor only ever returns active factors.
  // A balanced footprint across the three alcances, using factors whose values are sane. The
  // natural-gas row was dropped on purpose: its imported CH4 factor is one of the Excel's
  // known-implausible values (Requirements 12.3), and a demo should not showcase a wrong
  // number. An admin can correct it in the factor library and add it back.
  const specs: SourceSpec[] = [
    { scope: Scope.SCOPE_1, categoryContains: "Fuentes Fijas", elementContains: "Diésel o ACPM (B2) - Fijo", annualValue: "14957.10" },
    { scope: Scope.SCOPE_1, categoryContains: "Fuentes Móviles", elementContains: "Diésel B10 (Mezcla comercial) - Móvil", annualValue: "1500" },
    { scope: Scope.SCOPE_1, categoryContains: "Fugitivas", elementContains: "R-22", annualValue: "12.5" },
    { scope: Scope.SCOPE_3, categoryContains: "C6", elementContains: "Viajes aéreos - Recorridos largos", annualValue: "180000" },
    { scope: Scope.SCOPE_3, categoryContains: "C5", elementContains: "Compostaje de materia orgánica (base húmeda)", annualValue: "5200" },
  ];

  // 2023: a complete year. 2024: eight of twelve months, so the UI shows "8 de 12 meses".
  const electricity: SourceSpec = { scope: Scope.SCOPE_2, elementContains: "Electricidad" };

  for (const [year, ry, reportedMonths] of [
    [2023, yumbo2023, 12],
    [2024, yumbo2024, 8],
  ] as const) {
    for (const spec of specs) {
      const factor = await pickFactor(spec);
      if (!factor) {
        console.warn(`  ! ${year}: no factor matched "${spec.elementContains}", skipped`);
        continue;
      }
      await seedSource(ry.id, companyId, factor, spec);
    }

    const gridElement = await pickFactor(electricity);
    if (gridElement) {
      await seedSource(ry.id, companyId, gridElement, {
        ...electricity,
        monthlyValues: monthlyKwh(year === 2023 ? 118000 : 124000, reportedMonths),
      });
    } else {
      console.warn(`  ! ${year}: no Scope 2 electricity element found, skipped`);
    }
    console.log(`  ${year} (Planta Yumbo) seeded, ${reportedMonths}/12 months of electricity`);
  }

  // Sede Bogota reports electricity in both years, so the company aggregate compares like for
  // like and the year over year reads as a genuine, modest reduction. It reduced consumption
  // in 2024, which is the reduction story the dashboard exists to show.
  const gridElement = await pickFactor(electricity);
  if (gridElement) {
    await seedSource(bogota2023.id, companyId, gridElement, {
      ...electricity,
      monthlyValues: monthlyKwh(48000, 12),
    });
    await seedSource(bogota2024.id, companyId, gridElement, {
      ...electricity,
      monthlyValues: monthlyKwh(41000, 12),
    });
  }
  console.log("  2023 and 2024 (Sede Bogota) seeded");

  // Reduction targets per scope, so the Meta card and the "avance hacia la meta" KPI have
  // values to render. Set a touch above the demo's actuals, so the demo reads as on track.
  const targets: [Scope, string][] = [
    [Scope.SCOPE_1, "240"],
    [Scope.SCOPE_2, "235"],
    [Scope.SCOPE_3, "55"],
  ];
  for (const [scope, targetTonnes] of targets) {
    await prisma.scopeTarget.upsert({
      where: { reportingYearId_scope: { reportingYearId: yumbo2024.id, scope } },
      update: { targetTonnes },
      create: { reportingYearId: yumbo2024.id, companyId, scope, targetTonnes },
    });
  }

  await upsertCompanyUser(`demo1@${DEMO_EMAIL_DOMAIN}`, password, companyId);
  console.log(`  user demo1@${DEMO_EMAIL_DOMAIN}`);
}

async function seedEmptyCompany(password: string): Promise<void> {
  console.log(`\n${EMPTY_COMPANY}`);
  // No facilities on purpose: this tenant exercises every empty state in the product.
  const companyId = await findOrCreateCompany(EMPTY_COMPANY, { sector: "servicios-financieros" });
  await upsertCompanyUser(`demo2@${DEMO_EMAIL_DOMAIN}`, password, companyId);
  console.log(`  user demo2@${DEMO_EMAIL_DOMAIN}`);
}

async function main(): Promise<void> {
  const password = guard();

  const factorCount = await prisma.emissionFactor.count({ where: { active: true } });
  if (factorCount === 0) {
    console.error("The factor library is empty. Run `bun run db:seed` first.");
    process.exit(1);
  }

  await seedFullCompany(password);
  await seedEmptyCompany(password);

  console.log(
    `\nDemo data seeded. Sign in with demo1@${DEMO_EMAIL_DOMAIN} or demo2@${DEMO_EMAIL_DOMAIN}` +
      " using DEMO_PASSWORD from .env.local.",
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
