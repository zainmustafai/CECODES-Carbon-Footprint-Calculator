import { prisma } from "@/lib/prisma";

// The screen-gating state for the "todas las sedes" (company-wide) mode of the Reports screen:
// enough to decide which empty state to render and to populate the year selector, nothing more.
// The real numbers are only computed when an export button is actually clicked (loadReport),
// mirroring the existing separation between loadPreview (screen gating) and loadReport (export).
export type CompanyReportFiltersVM = {
  facilities: { id: string; name: string }[];
  years: number[];
  selectedYear: number | null;
  emptyReason: "noYear" | "noData" | null;
};

export async function loadCompanyReportFilters(
  companyId: string,
  requested: { year: number | null },
): Promise<CompanyReportFiltersVM> {
  const [facilities, reportingYears] = await Promise.all([
    prisma.facility.findMany({
      where: { companyId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.reportingYear.findMany({
      where: { companyId },
      select: { id: true, year: true },
    }),
  ]);

  const years = [...new Set(reportingYears.map((ry) => ry.year))].sort((a, b) => b - a);
  if (years.length === 0) {
    return { facilities, years: [], selectedYear: null, emptyReason: "noYear" };
  }

  const selectedYear = requested.year && years.includes(requested.year) ? requested.year : years[0];
  const idsForYear = reportingYears.filter((ry) => ry.year === selectedYear).map((ry) => ry.id);

  const [entryCount, cleanTechCount] = await Promise.all([
    prisma.activityEntry.count({ where: { reportingYearId: { in: idsForYear }, companyId } }),
    prisma.cleanTechEntry.count({ where: { reportingYearId: { in: idsForYear }, companyId } }),
  ]);

  if (entryCount === 0 && cleanTechCount === 0) {
    return { facilities, years, selectedYear, emptyReason: "noData" };
  }

  return { facilities, years, selectedYear, emptyReason: null };
}
