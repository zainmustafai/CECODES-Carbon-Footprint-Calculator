"use server";

import { revalidatePath, updateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { FACTOR_LIBRARY_TAG, GRID_FACTORS_TAG } from "../lib/factor-library-cache";
import {
  ScopeError,
  resolveAdminScope,
  scopeErrorKey,
} from "@/lib/auth/company-scope";
import {
  buildCreationDiff,
  buildFactorDiff,
  isEmptyDiff,
} from "../lib/factor-diff";
import {
  createFactorInput,
  createVersionInput,
  deleteGridFactorInput,
  setFactorActiveInput,
  updateFactorInput,
  upsertGridFactorInput,
} from "../schemas/factor-schemas";

function hasCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === code
  );
}

// The natural-key index (scope, category, COALESCE(subcategory,''), element, unit) is a
// hand written expression index, not Prisma owned, so a race may surface as the raw Postgres
// code 23505 rather than P2002. Check both, including a wrapped driver cause.
function isUniqueViolation(error: unknown): boolean {
  if (hasCode(error, "P2002") || hasCode(error, "23505")) return true;
  if (typeof error === "object" && error !== null && "cause" in error) {
    return hasCode((error as { cause?: unknown }).cause, "23505");
  }
  return false;
}

async function latestVersionId(): Promise<string | null> {
  const version = await prisma.emissionFactorVersion.findFirst({
    orderBy: { date: "desc" },
    select: { id: true },
  });
  return version?.id ?? null;
}

export async function createFactor(input: unknown): Promise<{
  error?: string;
  factorId?: string;
}> {
  const parsed = createFactorInput.safeParse(input);
  if (!parsed.success) return { error: "generic" };

  try {
    const scope = await resolveAdminScope();
    const data = parsed.data;

    // Natural-key pre-check for a friendly message. The expression index is the real guard
    // and catches any race below through isUniqueViolation.
    const clash = await prisma.emissionFactor.findFirst({
      where: {
        scope: data.scope,
        category: data.category,
        subcategory: data.subcategory,
        element: data.element,
        unit: data.unit,
      },
      select: { id: true },
    });
    if (clash) return { error: "factorExists" };

    const versionId = await latestVersionId();

    const created = await prisma.$transaction(async (tx) => {
      const factor = await tx.emissionFactor.create({
        data: { ...data, versionId },
      });
      await tx.emissionFactorChange.create({
        data: {
          factorId: factor.id,
          changedById: scope.appUser.id,
          changedByEmail: scope.appUser.email,
          action: "CREATED",
          changes: buildCreationDiff(factor) as unknown as Prisma.InputJsonValue,
        },
      });
      return factor;
    });

    revalidatePath("/admin/factors");
    updateTag(FACTOR_LIBRARY_TAG); // read-your-own-writes: the next render fetches fresh, not stale
    return { factorId: created.id };
  } catch (error) {
    if (isUniqueViolation(error)) return { error: "factorExists" };
    return { error: scopeErrorKey(error) };
  }
}

export async function updateFactor(input: unknown): Promise<{ error?: string }> {
  const parsed = updateFactorInput.safeParse(input);
  if (!parsed.success) return { error: "generic" };

  try {
    const scope = await resolveAdminScope();
    const { factorId, ...fields } = parsed.data;

    const before = await prisma.emissionFactor.findUnique({ where: { id: factorId } });
    if (!before) throw new ScopeError("not-found");

    const diff = buildFactorDiff(before, fields);
    // A no-op must never write an audit row. Identity fields (scope, category, element,
    // unit) are editable: an ActivityEntry snapshots its own labels, so a rename is safe.
    if (isEmptyDiff(diff)) return {};

    const versionId = await latestVersionId();

    await prisma.$transaction(async (tx) => {
      const result = await tx.emissionFactor.updateMany({
        where: { id: factorId },
        data: { ...fields, ...(versionId ? { versionId } : {}) },
      });
      if (result.count !== 1) throw new ScopeError("not-found");

      await tx.emissionFactorChange.create({
        data: {
          factorId,
          changedById: scope.appUser.id,
          changedByEmail: scope.appUser.email,
          action: "UPDATED",
          changes: diff as unknown as Prisma.InputJsonValue,
        },
      });
    });

    revalidatePath("/admin/factors");
    revalidatePath(`/admin/factors/${factorId}`);
    updateTag(FACTOR_LIBRARY_TAG); // read-your-own-writes: the next render fetches fresh, not stale
    return {};
  } catch (error) {
    if (isUniqueViolation(error)) return { error: "factorExists" };
    return { error: scopeErrorKey(error) };
  }
}

export async function setFactorActive(input: unknown): Promise<{ error?: string }> {
  const parsed = setFactorActiveInput.safeParse(input);
  if (!parsed.success) return { error: "generic" };

  try {
    const scope = await resolveAdminScope();
    const { factorId, active } = parsed.data;

    // Never hard-delete a factor: onDelete SetNull would orphan activity entries. Toggling
    // active is the only lifecycle a factor has.
    const diff = buildFactorDiff({ active: !active }, { active });

    await prisma.$transaction(async (tx) => {
      const result = await tx.emissionFactor.updateMany({
        where: { id: factorId },
        data: { active },
      });
      if (result.count !== 1) throw new ScopeError("not-found");

      await tx.emissionFactorChange.create({
        data: {
          factorId,
          changedById: scope.appUser.id,
          changedByEmail: scope.appUser.email,
          action: active ? "REACTIVATED" : "DEACTIVATED",
          changes: diff as unknown as Prisma.InputJsonValue,
        },
      });
    });

    revalidatePath("/admin/factors");
    revalidatePath(`/admin/factors/${factorId}`);
    updateTag(FACTOR_LIBRARY_TAG); // read-your-own-writes: the next render fetches fresh, not stale
    return {};
  } catch (error) {
    return { error: scopeErrorKey(error) };
  }
}

export async function createFactorVersion(input: unknown): Promise<{ error?: string }> {
  const parsed = createVersionInput.safeParse(input);
  if (!parsed.success) return { error: "generic" };

  const date = new Date(parsed.data.date);
  if (Number.isNaN(date.getTime())) return { error: "generic" };

  try {
    await resolveAdminScope();

    const existing = await prisma.emissionFactorVersion.findUnique({
      where: { version: parsed.data.version },
      select: { id: true },
    });
    if (existing) return { error: "versionExists" };

    await prisma.emissionFactorVersion.create({
      data: {
        version: parsed.data.version,
        date,
        preparedBy: parsed.data.preparedBy,
        reviewedBy: parsed.data.reviewedBy,
        authorizedBy: parsed.data.authorizedBy,
        description: parsed.data.description,
      },
    });

    revalidatePath("/admin/factors");
    updateTag(FACTOR_LIBRARY_TAG); // read-your-own-writes: the next render fetches fresh, not stale
    return {};
  } catch (error) {
    if (isUniqueViolation(error)) return { error: "versionExists" };
    return { error: scopeErrorKey(error) };
  }
}

export async function upsertGridFactor(input: unknown): Promise<{ error?: string }> {
  const parsed = upsertGridFactorInput.safeParse(input);
  if (!parsed.success) return { error: "generic" };

  try {
    const scope = await resolveAdminScope();
    const { year, factor, source } = parsed.data;

    await prisma.gridElectricityFactor.upsert({
      where: { year },
      create: { year, factor, source, updatedByEmail: scope.appUser.email },
      update: { factor, source, updatedByEmail: scope.appUser.email },
    });

    // The Scope-2 missing-factor banner re-reads grid_electricity_factors on every render,
    // so it clears on the next visit to the data-entry screen for that year.
    revalidatePath("/admin/factors");
    revalidatePath("/data-entry");
    updateTag(GRID_FACTORS_TAG);
    return {};
  } catch (error) {
    return { error: scopeErrorKey(error) };
  }
}

export async function deleteGridFactor(input: unknown): Promise<{ error?: string }> {
  const parsed = deleteGridFactorInput.safeParse(input);
  if (!parsed.success) return { error: "generic" };

  try {
    await resolveAdminScope();

    // Safe: activity entries join to the grid factor by year at compute time, so removing
    // a year does not orphan anything. Reports for that year show the missing-factor notice.
    const result = await prisma.gridElectricityFactor.deleteMany({
      where: { year: parsed.data.year },
    });
    if (result.count !== 1) throw new ScopeError("not-found");

    revalidatePath("/admin/factors");
    revalidatePath("/data-entry");
    updateTag(GRID_FACTORS_TAG);
    return {};
  } catch (error) {
    return { error: scopeErrorKey(error) };
  }
}
