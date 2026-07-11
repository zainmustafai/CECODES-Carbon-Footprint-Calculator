"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import {
  ScopeError,
  resolveCompanyScope,
  resolveFacilityScope,
  scopeErrorKey,
} from "@/lib/auth/company-scope";
import { createFacilityInput, updateFacilityInput } from "../schemas/facility-schema";

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}

function revalidate(companyId: string) {
  // Facilities render inside the company page now, so that is what must revalidate.
  revalidatePath("/company");
  revalidatePath("/data-entry");
  revalidatePath(`/admin/companies/${companyId}/company`);
  revalidatePath(`/admin/companies/${companyId}/data-entry`);
}

export async function createFacility(input: {
  companyId: string;
  name: string;
  location: string;
}): Promise<{ error?: string }> {
  const parsed = createFacilityInput.safeParse(input);
  if (!parsed.success) return { error: "generic" };

  try {
    // A company user's own companyId wins; an admin must name an existing company.
    const scope = await resolveCompanyScope({ companyId: parsed.data.companyId });
    await prisma.facility.create({
      data: {
        companyId: scope.companyId,
        name: parsed.data.name,
        location: parsed.data.location,
      },
    });
    revalidate(scope.companyId);
    return {};
  } catch (error) {
    if (isUniqueViolation(error)) return { error: "facilityExists" };
    return { error: scopeErrorKey(error) };
  }
}

export async function updateFacility(input: {
  facilityId: string;
  name: string;
  location: string;
}): Promise<{ error?: string }> {
  const parsed = updateFacilityInput.safeParse(input);
  if (!parsed.success) return { error: "generic" };

  try {
    const scope = await resolveFacilityScope(parsed.data.facilityId);
    const updated = await prisma.facility.updateMany({
      where: { id: parsed.data.facilityId, companyId: scope.companyId },
      data: { name: parsed.data.name, location: parsed.data.location },
    });
    if (updated.count !== 1) throw new ScopeError("not-found");

    revalidate(scope.companyId);
    return {};
  } catch (error) {
    if (isUniqueViolation(error)) return { error: "facilityExists" };
    return { error: scopeErrorKey(error) };
  }
}

// Deleting a facility cascades to its reporting years and every activity entry beneath
// them, so the UI confirms through an AlertDialog and the action refuses when years exist.
export async function deleteFacility(input: {
  facilityId: string;
}): Promise<{ error?: string }> {
  if (typeof input?.facilityId !== "string") return { error: "generic" };

  try {
    const scope = await resolveFacilityScope(input.facilityId);

    const years = await prisma.reportingYear.count({
      where: { facilityId: input.facilityId, companyId: scope.companyId },
    });
    if (years > 0) return { error: "facilityHasYears" };

    const deleted = await prisma.facility.deleteMany({
      where: { id: input.facilityId, companyId: scope.companyId },
    });
    if (deleted.count !== 1) throw new ScopeError("not-found");

    revalidate(scope.companyId);
    return {};
  } catch (error) {
    return { error: scopeErrorKey(error) };
  }
}
