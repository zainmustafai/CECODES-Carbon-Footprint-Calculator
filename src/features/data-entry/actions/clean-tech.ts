"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { resolveReportingYearScope, scopeErrorKey } from "@/lib/auth/company-scope";
import {
  addCleanTechInput,
  removeCleanTechInput,
  updateCleanTechInput,
} from "../schemas/clean-tech-schema";

// "Datos sobre tecnologías más limpias y buenas prácticas" (CECODES, 2026-07-24).
//
// These rows are pure reporting: they never touch the calculation engine, the dashboard totals
// or the audit of activity values. But they are still tenant data behind public POST endpoints,
// so every action re-validates with a .strict() schema and re-authorizes through
// resolveReportingYearScope, which derives the company FROM the reporting year rather than
// trusting anything the client sent. Writes are scoped updateMany/deleteMany and the count is
// checked: silence about a cross-tenant miss would report success for a write that never
// happened.

export async function addCleanTechAction(input: {
  reportingYearId: string;
  scope: "SCOPE_1" | "SCOPE_2" | "SCOPE_3" | null;
  category: string;
  subcategory: string;
  element: string;
  quantity: string;
  unit: string;
}): Promise<{ error?: string; id?: string }> {
  const parsed = addCleanTechInput.safeParse(input);
  if (!parsed.success) return { error: "invalidValue" };
  const data = parsed.data;

  try {
    const scope = await resolveReportingYearScope(data.reportingYearId);

    const created = await prisma.cleanTechEntry.create({
      data: {
        reportingYearId: data.reportingYearId,
        companyId: scope.companyId,
        scope: data.scope,
        category: data.category,
        subcategory: data.subcategory,
        element: data.element,
        quantity: data.quantity,
        unit: data.unit,
        createdByEmail: scope.appUser.email,
        updatedByEmail: scope.appUser.email,
      },
      select: { id: true },
    });

    revalidate(scope.companyId);
    return { id: created.id };
  } catch (error) {
    return { error: scopeErrorKey(error) };
  }
}

export async function updateCleanTechAction(input: {
  id: string;
  reportingYearId: string;
  scope: "SCOPE_1" | "SCOPE_2" | "SCOPE_3" | null;
  category: string;
  subcategory: string;
  element: string;
  quantity: string;
  unit: string;
}): Promise<{ error?: string }> {
  const parsed = updateCleanTechInput.safeParse(input);
  if (!parsed.success) return { error: "invalidValue" };
  const data = parsed.data;

  try {
    const scope = await resolveReportingYearScope(data.reportingYearId);

    const { count } = await prisma.cleanTechEntry.updateMany({
      where: {
        id: data.id,
        reportingYearId: data.reportingYearId,
        companyId: scope.companyId,
      },
      data: {
        scope: data.scope,
        category: data.category,
        subcategory: data.subcategory,
        element: data.element,
        quantity: data.quantity,
        unit: data.unit,
        updatedByEmail: scope.appUser.email,
      },
    });
    // Zero rows means the id was not this tenant's (or does not exist). Same opaque answer
    // either way: the response must not reveal which.
    if (count === 0) return { error: "notFound" };

    revalidate(scope.companyId);
    return {};
  } catch (error) {
    return { error: scopeErrorKey(error) };
  }
}

export async function removeCleanTechAction(input: {
  id: string;
  reportingYearId: string;
}): Promise<{ error?: string }> {
  const parsed = removeCleanTechInput.safeParse(input);
  if (!parsed.success) return { error: "invalidValue" };
  const data = parsed.data;

  try {
    const scope = await resolveReportingYearScope(data.reportingYearId);

    const { count } = await prisma.cleanTechEntry.deleteMany({
      where: {
        id: data.id,
        reportingYearId: data.reportingYearId,
        companyId: scope.companyId,
      },
    });
    if (count === 0) return { error: "notFound" };

    revalidate(scope.companyId);
    return {};
  } catch (error) {
    return { error: scopeErrorKey(error) };
  }
}

function revalidate(companyId: string) {
  revalidatePath("/data-entry");
  revalidatePath("/preview");
  revalidatePath(`/admin/companies/${companyId}/data-entry`);
  revalidatePath(`/admin/companies/${companyId}/preview`);
}
