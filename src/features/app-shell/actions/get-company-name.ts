"use server";

import { prisma } from "@/lib/prisma";
import { resolveCompanyScope } from "@/lib/auth/company-scope";

// The shell layout is an ancestor of app/(app)/admin/companies/[companyId]/layout.tsx and
// therefore cannot read its params or context. The topbar and sidebar resolve the drilled
// company name through this action instead. Guarded like any other tenant read.
export async function getCompanyName(companyId: string): Promise<{ name?: string }> {
  try {
    const scope = await resolveCompanyScope({ companyId });
    const company = await prisma.company.findUnique({
      where: { id: scope.companyId },
      select: { name: true },
    });
    return company ? { name: company.name } : {};
  } catch {
    return {};
  }
}
