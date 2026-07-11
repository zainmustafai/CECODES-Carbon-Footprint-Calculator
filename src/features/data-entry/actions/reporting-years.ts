"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import {
  ScopeError,
  resolveFacilityScope,
  resolveReportingYearScope,
  scopeErrorKey,
} from "@/lib/auth/company-scope";
import { resolveGwpSet } from "@/lib/gwp";
import {
  createReportingYearInput,
  deleteReportingYearInput,
} from "../schemas/reporting-year-schema";

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

// Deletes a reporting year and, by cascade, its activity entries, applicability rows, scope
// targets and result snapshots. The UI states the entry count before asking.
//
// This is also what makes a facility deletable: deleteFacility refuses while any year exists,
// and before this action there was no way to remove one, so a facility that had ever been
// used could never be deleted through the UI.
export async function deleteReportingYear(input: {
  reportingYearId: string;
}): Promise<{ error?: string }> {
  const parsed = deleteReportingYearInput.safeParse(input);
  if (!parsed.success) return { error: "generic" };

  try {
    // Derives the company FROM the row, so a caller cannot pair their own companyId with
    // someone else's reportingYearId.
    const scope = await resolveReportingYearScope(parsed.data.reportingYearId);

    const deleted = await prisma.reportingYear.deleteMany({
      where: { id: parsed.data.reportingYearId, companyId: scope.companyId },
    });
    if (deleted.count !== 1) throw new ScopeError("not-found");

    revalidatePath("/facilities");
    revalidatePath("/data-entry");
    revalidatePath(`/admin/companies/${scope.companyId}/facilities`);
    revalidatePath(`/admin/companies/${scope.companyId}/data-entry`);
    return {};
  } catch (error) {
    return { error: scopeErrorKey(error) };
  }
}
