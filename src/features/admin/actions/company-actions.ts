"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { ScopeError, resolveAdminScope, scopeErrorKey } from "@/lib/auth/company-scope";
import {
  createCompanyInput,
  deleteCompanyInput,
  setCompanyActiveInput,
  updateCompanyInput,
} from "../schemas/company-schemas";

// Every company action is a CECODES-admin action: it authorizes with resolveAdminScope,
// never resolveCompanyScope. A company user must not be able to rename, deactivate, or
// delete their own company through an admin endpoint. Company.name is not unique in the
// schema, so there is no uniqueness error to map here.

export async function createCompany(input: {
  name: string;
  sector?: string;
}): Promise<{ error?: string; companyId?: string }> {
  const parsed = createCompanyInput.safeParse(input);
  if (!parsed.success) return { error: "generic" };

  try {
    await resolveAdminScope();
    const company = await prisma.company.create({
      // An omitted sector is written as null rather than left undefined.
      data: { name: parsed.data.name, sector: parsed.data.sector ?? null },
      select: { id: true },
    });
    revalidatePath("/admin/companies");
    return { companyId: company.id };
  } catch (error) {
    return { error: scopeErrorKey(error) };
  }
}

export async function updateCompany(input: {
  companyId: string;
  name: string;
  sector?: string;
}): Promise<{ error?: string }> {
  const parsed = updateCompanyInput.safeParse(input);
  if (!parsed.success) return { error: "generic" };

  try {
    await resolveAdminScope();
    // updateMany returns { count: 0 } instead of throwing when nothing matches, so an
    // unchecked count would report success on a nonexistent id.
    const updated = await prisma.company.updateMany({
      where: { id: parsed.data.companyId },
      // sector ?? null so clearing the field on edit actually nulls it. Passing undefined
      // to Prisma would mean "leave unchanged".
      data: { name: parsed.data.name, sector: parsed.data.sector ?? null },
    });
    if (updated.count !== 1) throw new ScopeError("not-found");

    revalidatePath("/admin/companies");
    return {};
  } catch (error) {
    return { error: scopeErrorKey(error) };
  }
}

// Deactivation is the general-purpose tool: it blocks the company's users (enforced in
// resolveCompanyScope and by CompanyInactiveScreen) without touching any data.
export async function setCompanyActive(input: {
  companyId: string;
  active: boolean;
}): Promise<{ error?: string }> {
  const parsed = setCompanyActiveInput.safeParse(input);
  if (!parsed.success) return { error: "generic" };

  try {
    await resolveAdminScope();
    const updated = await prisma.company.updateMany({
      where: { id: parsed.data.companyId },
      data: { active: parsed.data.active },
    });
    if (updated.count !== 1) throw new ScopeError("not-found");

    revalidatePath("/admin/companies");
    return {};
  } catch (error) {
    return { error: scopeErrorKey(error) };
  }
}

// deleteCompany is allowed ONLY when the company has zero facilities AND zero users.
// Deleting cascades facilities to reporting years to activity entries, and AppUser.companyId
// would be SET NULL, silently dumping real users back into onboarding where they would
// create a stray company. Refusing mirrors the existing facilityHasYears rule. Because
// nothing valuable can be lost once it IS empty, a plain AlertDialog confirm is enough: no
// type-the-name-to-confirm ceremony.
export async function deleteCompany(input: {
  companyId: string;
}): Promise<{ error?: string }> {
  const parsed = deleteCompanyInput.safeParse(input);
  if (!parsed.success) return { error: "generic" };

  try {
    await resolveAdminScope();

    const [facilities, users] = await Promise.all([
      prisma.facility.count({ where: { companyId: parsed.data.companyId } }),
      prisma.appUser.count({ where: { companyId: parsed.data.companyId } }),
    ]);
    if (facilities > 0 || users > 0) return { error: "companyHasData" };

    const deleted = await prisma.company.deleteMany({
      where: { id: parsed.data.companyId },
    });
    if (deleted.count !== 1) throw new ScopeError("not-found");

    revalidatePath("/admin/companies");
    return {};
  } catch (error) {
    return { error: scopeErrorKey(error) };
  }
}
