import { prisma } from "@/lib/prisma";

// The earliest ReportingYear across every facility of a company - the baseline the client's
// reduction target is measured against. "First year reported" is a per-COMPANY concept (the
// client's own words), not per-Sede: ReportingYear.companyId is denormalized onto the row, so
// this is a direct, joinless MIN(year) across every facility.
export async function getCompanyFirstReportedYear(companyId: string): Promise<number | null> {
  const earliest = await prisma.reportingYear.findFirst({
    where: { companyId },
    orderBy: { year: "asc" },
    select: { year: true },
  });
  return earliest?.year ?? null;
}
