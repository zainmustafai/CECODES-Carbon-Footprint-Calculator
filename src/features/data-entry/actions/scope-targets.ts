"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { resolveReportingYearScope, scopeErrorKey } from "@/lib/auth/company-scope";
import { saveScopeTargetInput } from "../schemas/scope-target-schema";

// Saves or clears the reduction target (Meta) for one scope of one reporting year.
//
// Clearing deletes the row rather than storing zero: zero is a legitimate target, and the
// absence of a target is not the same as a target of nothing.
export async function saveScopeTarget(input: {
  reportingYearId: string;
  scope: "SCOPE_1" | "SCOPE_2" | "SCOPE_3";
  targetTonnes: string;
}): Promise<{ error?: string; cleared?: boolean }> {
  const parsed = saveScopeTargetInput.safeParse(input);
  if (!parsed.success) return { error: "invalidValue" };
  const { reportingYearId, scope, targetTonnes } = parsed.data;

  try {
    // Derives the company FROM the reporting year, never from the caller's claim.
    const companyScope = await resolveReportingYearScope(reportingYearId);

    if (targetTonnes === null) {
      // count 0 is fine here: clearing a target that was never set is a no-op, not an error.
      await prisma.scopeTarget.deleteMany({
        where: { reportingYearId, scope, companyId: companyScope.companyId },
      });
      revalidate(companyScope.companyId);
      return { cleared: true };
    }

    await prisma.scopeTarget.upsert({
      where: { reportingYearId_scope: { reportingYearId, scope } },
      update: { targetTonnes },
      create: {
        reportingYearId,
        companyId: companyScope.companyId,
        scope,
        targetTonnes,
      },
    });

    revalidate(companyScope.companyId);
    return {};
  } catch (error) {
    return { error: scopeErrorKey(error) };
  }
}

function revalidate(companyId: string) {
  revalidatePath("/data-entry");
  revalidatePath("/dashboard");
  revalidatePath(`/admin/companies/${companyId}/data-entry`);
  revalidatePath(`/admin/companies/${companyId}/dashboard`);
}
