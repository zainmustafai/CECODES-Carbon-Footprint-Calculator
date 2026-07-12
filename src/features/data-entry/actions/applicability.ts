"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { resolveReportingYearScope, scopeErrorKey } from "@/lib/auth/company-scope";
import { setCategoryAppliesInput } from "../schemas/entry-schemas";

// The "¿Aplica?" toggle. Marking a category as not applicable is only allowed while it has
// no sources: silently deleting a company's recorded consumption behind a switch would be
// the worst possible failure mode for an inventory tool.
export async function setCategoryApplies(input: {
  reportingYearId: string;
  scope: "SCOPE_1" | "SCOPE_2" | "SCOPE_3";
  category: string;
  applies: boolean;
}): Promise<{ error?: string }> {
  const parsed = setCategoryAppliesInput.safeParse(input);
  if (!parsed.success) return { error: "generic" };
  const { reportingYearId, scope: entryScope, category, applies } = parsed.data;

  try {
    const scope = await resolveReportingYearScope(reportingYearId);

    // `category` is a free-form label from the client. Accept it only if the factor library
    // actually has that (scope, category) pair.
    const known = await prisma.emissionFactor.findFirst({
      where: { scope: entryScope, category, active: true },
      select: { id: true },
    });
    if (!known) return { error: "unknownCategory" };

    if (!applies) {
      const sources = await prisma.activityEntry.count({
        where: { reportingYearId, companyId: scope.companyId, scope: entryScope, category },
      });
      if (sources > 0) return { error: "categoryHasSources" };
    }

    await prisma.categoryApplicability.upsert({
      where: {
        reportingYearId_scope_category: { reportingYearId, scope: entryScope, category },
      },
      update: { applies },
      create: {
        reportingYearId,
        companyId: scope.companyId,
        scope: entryScope,
        category,
        applies,
      },
    });

    revalidatePath("/data-entry");
    revalidatePath(`/admin/companies/${scope.companyId}/data-entry`);
    return {};
  } catch (error) {
    return { error: scopeErrorKey(error) };
  }
}
