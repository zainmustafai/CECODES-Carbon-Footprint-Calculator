"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { ScopeError, resolveCompanyScope, scopeErrorKey } from "@/lib/auth/company-scope";
import { updateCompanyProfileInput } from "../schemas/company-schema";

// Updates the company profile.
//
// resolveCompanyScope, not resolveAdminScope: this endpoint is for the company's own users.
// A company user's own companyId wins and a different one is refused; an admin must name an
// existing company, which is exactly what the drill-down route supplies.
export async function updateCompanyProfile(input: {
  companyId: string;
  name: string;
  sector?: string;
  contactEmail?: string;
}): Promise<{ error?: string }> {
  const parsed = updateCompanyProfileInput.safeParse(input);
  if (!parsed.success) return { error: "generic" };
  const { companyId, name, sector, contactEmail } = parsed.data;

  try {
    const scope = await resolveCompanyScope({ companyId });

    const updated = await prisma.company.updateMany({
      where: { id: scope.companyId },
      data: {
        name,
        // An empty field means "not set". Storing "" would render as a blank sector chip.
        sector: sector && sector.length > 0 ? sector : null,
        contactEmail: contactEmail && contactEmail.length > 0 ? contactEmail : null,
      },
    });
    // updateMany returns { count: 0 } rather than throwing, so an unchecked count would
    // report success on a write that matched nothing.
    if (updated.count !== 1) throw new ScopeError("not-found");

    revalidatePath("/company");
    revalidatePath("/dashboard");
    revalidatePath("/admin/companies");
    revalidatePath(`/admin/companies/${scope.companyId}/company`);
    revalidatePath(`/admin/companies/${scope.companyId}/dashboard`);
    return {};
  } catch (error) {
    return { error: scopeErrorKey(error) };
  }
}
