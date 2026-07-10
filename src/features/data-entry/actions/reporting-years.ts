"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { resolveFacilityScope, scopeErrorKey } from "@/lib/auth/company-scope";
import { resolveGwpSet } from "@/lib/gwp";
import { createReportingYearInput } from "../schemas/reporting-year-schema";

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}

// Creates a reporting year for a facility. This is the single place gwpSet is resolved, and
// it is pinned on the row so a later change to the AR5/AR6 boundary cannot silently restate
// a past year's emissions.
export async function createReportingYear(input: {
  facilityId: string;
  year: number;
}): Promise<{ error?: string; reportingYearId?: string }> {
  const parsed = createReportingYearInput.safeParse(input);
  if (!parsed.success) return { error: "generic" };
  const { facilityId, year } = parsed.data;

  try {
    const scope = await resolveFacilityScope(facilityId);

    const created = await prisma.reportingYear.create({
      data: {
        facilityId,
        companyId: scope.companyId,
        year,
        gwpSet: resolveGwpSet(year),
      },
      select: { id: true },
    });

    revalidatePath("/data-entry");
    revalidatePath(`/admin/companies/${scope.companyId}/data-entry`);
    return { reportingYearId: created.id };
  } catch (error) {
    if (isUniqueViolation(error)) return { error: "yearExists" };
    return { error: scopeErrorKey(error) };
  }
}
