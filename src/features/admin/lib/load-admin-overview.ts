import "server-only";
import { prisma } from "@/lib/prisma";
import { resolveAdminScope } from "@/lib/auth/company-scope";

// The data behind the admin home. Cross-company aggregates are exactly what an admin is allowed
// to see, so the loader authorizes itself with resolveAdminScope and then reads every tenant.
// The heavy per-entry work is done with groupBy counts, never by pulling entries into memory: the
// portfolio can hold many years of twelve-month grids.

export type AttentionKind =
  | "emptyYear" // a reporting year exists but no source was ever added
  | "stalled" // sources exist but not one value has been reported
  | "missingGridFactor" // Scope 2 data exists for a year with no SIN grid factor, so it cannot be priced
  | "scope2Incomplete"; // some Scope 2 months are still blank

export type AttentionItem = {
  companyId: string;
  companyName: string;
  facilityName: string;
  year: number;
  kind: AttentionKind;
  blankMonths?: number; // for scope2Incomplete
};

export type PortfolioStatus = {
  reporting: number; // active companies with reported data in any year
  started: number; // active companies with reporting years but no data yet
  noData: number; // active companies with no reporting year at all
};

export type AdminOverview = {
  companies: { total: number; active: number; inactive: number };
  usersTotal: number;
  currentYear: number;
  currentYearReporting: number; // active companies that have entered current-year data
  currentYearStarted: number; // active companies with a current-year reporting year
  portfolio: PortfolioStatus;
  attention: AttentionItem[];
  library: {
    factorCount: number;
    version: { version: string; date: Date } | null;
    recentChanges: number; // library edits in the last 30 days
  };
};

const RECENT_DAYS = 30;
const SEVERITY: Record<AttentionKind, number> = {
  emptyYear: 0,
  stalled: 1,
  missingGridFactor: 2,
  scope2Incomplete: 3,
};

export async function loadAdminOverview(): Promise<AdminOverview> {
  await resolveAdminScope();

  const currentYear = new Date().getFullYear();
  const since = new Date(Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000);

  const [
    companiesTotal,
    activeCompanies,
    usersTotal,
    factorCount,
    version,
    recentChanges,
    years,
    totalByYear,
    reportedByYear,
    scope2AnyByYear,
    scope2BlankByYear,
    gridFactors,
  ] = await Promise.all([
    prisma.company.count(),
    prisma.company.findMany({ where: { active: true }, select: { id: true } }),
    prisma.appUser.count(),
    prisma.emissionFactor.count(),
    prisma.emissionFactorVersion.findFirst({
      orderBy: { date: "desc" },
      select: { version: true, date: true },
    }),
    prisma.emissionFactorChange.count({ where: { changedAt: { gte: since } } }),
    prisma.reportingYear.findMany({
      select: {
        id: true,
        year: true,
        facility: {
          select: { name: true, company: { select: { id: true, name: true, active: true } } },
        },
      },
    }),
    prisma.activityEntry.groupBy({ by: ["reportingYearId"], _count: { _all: true } }),
    prisma.activityEntry.groupBy({
      by: ["reportingYearId"],
      where: { value: { not: null } },
      _count: { _all: true },
    }),
    prisma.activityEntry.groupBy({
      by: ["reportingYearId"],
      where: { scope: "SCOPE_2" },
      _count: { _all: true },
    }),
    prisma.activityEntry.groupBy({
      by: ["reportingYearId"],
      where: { scope: "SCOPE_2", value: null },
      _count: { _all: true },
    }),
    prisma.gridElectricityFactor.findMany({ select: { year: true } }),
  ]);

  const totalMap = new Map(totalByYear.map((r) => [r.reportingYearId, r._count._all]));
  const reportedMap = new Map(reportedByYear.map((r) => [r.reportingYearId, r._count._all]));
  const s2AnyMap = new Map(scope2AnyByYear.map((r) => [r.reportingYearId, r._count._all]));
  const s2BlankMap = new Map(scope2BlankByYear.map((r) => [r.reportingYearId, r._count._all]));
  const gridYears = new Set(gridFactors.map((g) => g.year));

  const attention: AttentionItem[] = [];
  const companyHasData = new Set<string>();
  const companyHasYear = new Set<string>();
  const currentYearStartedSet = new Set<string>();
  const currentYearReportingSet = new Set<string>();

  for (const y of years) {
    const company = y.facility.company;
    companyHasYear.add(company.id);
    const total = totalMap.get(y.id) ?? 0;
    const reported = reportedMap.get(y.id) ?? 0;
    if (reported > 0) companyHasData.add(company.id);

    if (y.year === currentYear && company.active) {
      currentYearStartedSet.add(company.id);
      if (reported > 0) currentYearReportingSet.add(company.id);
    }

    // The "call this company" list is about active members who need help.
    if (!company.active) continue;

    const base = {
      companyId: company.id,
      companyName: company.name,
      facilityName: y.facility.name,
      year: y.year,
    };
    if (total === 0) {
      attention.push({ ...base, kind: "emptyYear" });
    } else if (reported === 0) {
      attention.push({ ...base, kind: "stalled" });
    } else {
      const s2any = s2AnyMap.get(y.id) ?? 0;
      const s2blank = s2BlankMap.get(y.id) ?? 0;
      if (s2any > 0 && !gridYears.has(y.year)) {
        // A missing grid factor blocks Scope 2 entirely, so it outranks a merely partial one.
        attention.push({ ...base, kind: "missingGridFactor" });
      } else if (s2blank > 0) {
        attention.push({ ...base, kind: "scope2Incomplete", blankMonths: s2blank });
      }
    }
  }

  attention.sort(
    (a, b) =>
      SEVERITY[a.kind] - SEVERITY[b.kind] ||
      b.year - a.year ||
      a.companyName.localeCompare(b.companyName),
  );

  let reporting = 0;
  let started = 0;
  let noData = 0;
  for (const c of activeCompanies) {
    if (companyHasData.has(c.id)) reporting += 1;
    else if (companyHasYear.has(c.id)) started += 1;
    else noData += 1;
  }

  return {
    companies: {
      total: companiesTotal,
      active: activeCompanies.length,
      inactive: companiesTotal - activeCompanies.length,
    },
    usersTotal,
    currentYear,
    currentYearReporting: currentYearReportingSet.size,
    currentYearStarted: currentYearStartedSet.size,
    portfolio: { reporting, started, noData },
    attention,
    library: { factorCount, version, recentChanges },
  };
}
