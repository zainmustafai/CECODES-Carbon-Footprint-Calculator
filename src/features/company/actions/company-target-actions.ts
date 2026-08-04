"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { resolveCompanyScope, scopeErrorKey } from "@/lib/auth/company-scope";
import { getCompanyFirstReportedYear } from "../lib/first-reported-year";
import { saveCompanyTargetInput } from "../schemas/company-target-schema";

// Saves, updates, or clears the company's single reduction-goal percentage. One target per
// company (unique on companyId), measured against the company's first reported year - see
// first-reported-year.ts. Clearing deletes the row rather than storing 0: an unset target is
// not the same as "reduce by nothing."
export async function saveCompanyTarget(input: {
  companyId: string;
  reductionPct: string;
}): Promise<{ error?: string; cleared?: boolean }> {
  const parsed = saveCompanyTargetInput.safeParse(input);
  if (!parsed.success) return { error: "invalidValue" };
  const { companyId, reductionPct } = parsed.data;

  try {
    const scope = await resolveCompanyScope({ companyId });

    if (reductionPct === null) {
      await prisma.companyTarget.deleteMany({ where: { companyId: scope.companyId } });
      revalidate(scope.companyId);
      return { cleared: true };
    }

    // A goal measured "against the first reported year" is meaningless before one exists.
    const firstYear = await getCompanyFirstReportedYear(scope.companyId);
    if (firstYear === null) return { error: "noBaselineYear" };

    await prisma.companyTarget.upsert({
      where: { companyId: scope.companyId },
      update: { reductionPct },
      create: { companyId: scope.companyId, reductionPct },
    });

    revalidate(scope.companyId);
    return {};
  } catch (error) {
    return { error: scopeErrorKey(error) };
  }
}

function revalidate(companyId: string) {
  revalidatePath("/company");
  revalidatePath("/dashboard");
  revalidatePath(`/admin/companies/${companyId}/company`);
  revalidatePath(`/admin/companies/${companyId}/dashboard`);
}
