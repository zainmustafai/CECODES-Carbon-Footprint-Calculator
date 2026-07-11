"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import {
  ScopeError,
  resolveReportingYearScope,
  scopeErrorKey,
  type ReportingYearScope,
} from "@/lib/auth/company-scope";
import { monthsForScope } from "../lib/months";
import {
  addSourceInput,
  copyJanuaryInput,
  removeSourceInput,
  saveEntryValuesInput,
} from "../schemas/entry-schemas";

// Server Actions are public POST endpoints and never run a layout, so each of these
// authorizes itself. The company is always derived from the reporting-year row, never from
// an argument, which is what stops a user of company A from pairing their own companyId
// with company B's reportingYearId.

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}

function revalidate(scope: ReportingYearScope) {
  revalidatePath("/data-entry");
  revalidatePath(`/admin/companies/${scope.companyId}/data-entry`);
}

// Adding a source materializes its rows straight away, with value = null. The rows are what
// record that the source belongs to this year, and they let every later save be a keyed
// update rather than an upsert, which removes the create-or-update race entirely.
export async function addSource(input: {
  reportingYearId: string;
  emissionFactorId: string;
}): Promise<{ error?: string }> {
  const parsed = addSourceInput.safeParse(input);
  if (!parsed.success) return { error: "generic" };
  const { reportingYearId, emissionFactorId } = parsed.data;

  try {
    const scope = await resolveReportingYearScope(reportingYearId);

    const factor = await prisma.emissionFactor.findFirst({
      where: { id: emissionFactorId, active: true },
      select: {
        id: true,
        scope: true,
        category: true,
        subcategory: true,
        element: true,
        unit: true,
      },
    });
    if (!factor) return { error: "factorUnavailable" };

    // scope, category, subcategory, element and unit are snapshotted from the factor, never
    // accepted from the client. The library is versioned and mutable, so the labels the user
    // entered against have to survive a later rename or deactivation.
    await prisma.$transaction(async (tx) => {
      await tx.activityEntry.createMany({
        data: monthsForScope(factor.scope).map((month) => ({
          reportingYearId,
          companyId: scope.companyId,
          emissionFactorId: factor.id,
          scope: factor.scope,
          category: factor.category,
          subcategory: factor.subcategory,
          element: factor.element,
          unit: factor.unit,
          month,
          value: null,
        })),
      });

      // Adding a source into a category previously marked "no aplica" reopens it.
      await tx.categoryApplicability.upsert({
        where: {
          reportingYearId_scope_category: {
            reportingYearId,
            scope: factor.scope,
            category: factor.category,
          },
        },
        update: { applies: true },
        create: {
          reportingYearId,
          companyId: scope.companyId,
          scope: factor.scope,
          category: factor.category,
          applies: true,
        },
      });
    });

    revalidate(scope);
    return {};
  } catch (error) {
    if (isUniqueViolation(error)) return { error: "sourceExists" };
    return { error: scopeErrorKey(error) };
  }
}

export async function removeSource(input: {
  reportingYearId: string;
  emissionFactorId: string;
}): Promise<{ error?: string }> {
  const parsed = removeSourceInput.safeParse(input);
  if (!parsed.success) return { error: "generic" };
  const { reportingYearId, emissionFactorId } = parsed.data;

  try {
    const scope = await resolveReportingYearScope(reportingYearId);
    const deleted = await prisma.activityEntry.deleteMany({
      where: { reportingYearId, companyId: scope.companyId, emissionFactorId },
    });
    if (deleted.count === 0) throw new ScopeError("not-found");

    revalidate(scope);
    return {};
  } catch (error) {
    return { error: scopeErrorKey(error) };
  }
}

// The autosave path. The client batches every dirty cell into one call, so tabbing across a
// twelve-month grid is one request rather than twelve.
export async function saveEntryValues(input: {
  reportingYearId: string;
  values: { entryId: string; value: string }[];
}): Promise<{ error?: string }> {
  const parsed = saveEntryValuesInput.safeParse(input);
  if (!parsed.success) return { error: "invalidValue" };
  const { reportingYearId, values } = parsed.data;

  try {
    const scope = await resolveReportingYearScope(reportingYearId);

    await prisma.$transaction(async (tx) => {
      for (const { entryId, value } of values) {
        // updateMany returns { count: 0 } rather than throwing when nothing matches, so an
        // unchecked count would report success on a cross-tenant write.
        const result = await tx.activityEntry.updateMany({
          where: { id: entryId, reportingYearId, companyId: scope.companyId },
          data: { value },
        });
        if (result.count !== 1) throw new ScopeError("forbidden");
      }
    });

    // No revalidatePath: this is the hot path and the client already holds the value.
    return {};
  } catch (error) {
    return { error: scopeErrorKey(error) };
  }
}

// Scope 2 convenience: many companies bill a flat monthly consumption.
export async function copyJanuaryToAll(input: {
  reportingYearId: string;
  emissionFactorId: string;
}): Promise<{ error?: string }> {
  const parsed = copyJanuaryInput.safeParse(input);
  if (!parsed.success) return { error: "generic" };
  const { reportingYearId, emissionFactorId } = parsed.data;

  try {
    const scope = await resolveReportingYearScope(reportingYearId);

    const january = await prisma.activityEntry.findFirst({
      where: { reportingYearId, companyId: scope.companyId, emissionFactorId, month: 1 },
      select: { value: true },
    });
    if (!january || january.value === null) return { error: "januaryEmpty" };

    // Only the UNREPORTED months (value IS NULL). This used to overwrite months 2..12
    // wholesale, so one tap could silently destroy eleven distinct reported values with no
    // undo. As a fill-the-gaps action it is non-destructive by construction, which is also
    // why it needs no confirmation dialog.
    await prisma.activityEntry.updateMany({
      where: {
        reportingYearId,
        companyId: scope.companyId,
        emissionFactorId,
        month: { not: 1 },
        value: null,
      },
      data: { value: january.value },
    });

    revalidate(scope);
    return {};
  } catch (error) {
    return { error: scopeErrorKey(error) };
  }
}
