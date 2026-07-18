"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@/lib/generated/prisma/client";
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

// The columns every audit row shares: which year, which company, and who did it. The actor is
// taken from the resolved scope (scope.appUser), never from the client, and the email is
// denormalized so the row still names them after the account is deleted.
function auditKey(scope: ReportingYearScope, reportingYearId: string) {
  return {
    reportingYearId,
    companyId: scope.companyId,
    changedById: scope.appUser.id,
    changedByEmail: scope.appUser.email,
  } as const;
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

      await tx.activityEntryChange.create({
        data: {
          ...auditKey(scope, reportingYearId),
          emissionFactorId: factor.id,
          scope: factor.scope,
          element: factor.element,
          month: null,
          action: "SOURCE_ADDED",
          changes: {},
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

    await prisma.$transaction(async (tx) => {
      // Read the rows before deleting: their element/scope describe the source, and any
      // non-null values are real data being destroyed, which the audit should preserve so
      // "who deleted this" also captures "what was lost".
      const rows = await tx.activityEntry.findMany({
        where: { reportingYearId, companyId: scope.companyId, emissionFactorId },
        select: { scope: true, element: true, month: true, value: true },
      });
      if (rows.length === 0) throw new ScopeError("not-found");

      await tx.activityEntry.deleteMany({
        where: { reportingYearId, companyId: scope.companyId, emissionFactorId },
      });

      const removed = rows
        .filter((r) => r.value !== null)
        .map((r) => ({ month: r.month, value: r.value!.toString() }));
      await tx.activityEntryChange.create({
        data: {
          ...auditKey(scope, reportingYearId),
          emissionFactorId,
          scope: rows[0].scope,
          element: rows[0].element,
          month: null,
          action: "SOURCE_REMOVED",
          changes: { removed },
        },
      });
    });

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
      const changes: Prisma.ActivityEntryChangeCreateManyInput[] = [];
      for (const { entryId, value } of values) {
        // Read the current row first: the scope check is the same one the update needs, and its
        // old value is the "from" side of the audit. Selecting by the tenant-scoped key means a
        // cross-tenant entryId returns nothing and is rejected before any write.
        const before = await tx.activityEntry.findFirst({
          where: { id: entryId, reportingYearId, companyId: scope.companyId },
          select: { value: true, scope: true, element: true, month: true, emissionFactorId: true },
        });
        if (!before) throw new ScopeError("forbidden");

        // updateMany returns { count: 0 } rather than throwing when nothing matches, so an
        // unchecked count would report success on a cross-tenant write.
        const result = await tx.activityEntry.updateMany({
          where: { id: entryId, reportingYearId, companyId: scope.companyId },
          data: { value },
        });
        if (result.count !== 1) throw new ScopeError("forbidden");

        const from = before.value === null ? null : before.value.toString();
        const to = value === null ? null : String(value);
        if (from === to) continue; // an autosave batch can include unchanged cells; do not log them
        changes.push({
          ...auditKey(scope, reportingYearId),
          emissionFactorId: before.emissionFactorId,
          scope: before.scope,
          element: before.element,
          month: before.month,
          action: to === null ? "VALUE_CLEARED" : "VALUE_SET",
          changes: { value: { from, to } },
        });
      }
      if (changes.length > 0) await tx.activityEntryChange.createMany({ data: changes });
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
      select: { value: true, scope: true, element: true },
    });
    if (!january || january.value === null) return { error: "januaryEmpty" };
    // Capture the non-null value in a local: TS does not carry the null-narrowing of a property
    // access into the transaction closure below.
    const januaryValue = january.value;

    await prisma.$transaction(async (tx) => {
      // Only the UNREPORTED months (value IS NULL). This used to overwrite months 2..12
      // wholesale, so one tap could silently destroy eleven distinct reported values with no
      // undo. As a fill-the-gaps action it is non-destructive by construction, which is also
      // why it needs no confirmation dialog.
      const filled = await tx.activityEntry.updateMany({
        where: {
          reportingYearId,
          companyId: scope.companyId,
          emissionFactorId,
          month: { not: 1 },
          value: null,
        },
        data: { value: januaryValue },
      });

      // Nothing to log if every month was already filled.
      if (filled.count > 0) {
        await tx.activityEntryChange.create({
          data: {
            ...auditKey(scope, reportingYearId),
            emissionFactorId,
            scope: january.scope,
            element: january.element,
            month: null,
            action: "COPIED",
            changes: { value: januaryValue.toString(), months: filled.count },
          },
        });
      }
    });

    revalidate(scope);
    return {};
  } catch (error) {
    return { error: scopeErrorKey(error) };
  }
}
