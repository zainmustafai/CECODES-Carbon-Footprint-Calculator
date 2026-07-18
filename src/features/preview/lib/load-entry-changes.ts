import "server-only";
import { prisma } from "@/lib/prisma";
import type { EntryChangeAction, Scope } from "@/lib/generated/prisma/client";

// The data-entry audit trail for one sede-year: who entered or changed which number, and when.
// CECODES's traceability requirement (2026-07-18). Read-only; loadPreview's callers already
// guard the companyId, so this takes it as given and never authorizes on its own.

export type EntryChangeRow = {
  id: string;
  action: EntryChangeAction;
  scope: Scope;
  element: string;
  month: number | null;
  // Present only for value edits. Decimals cross the RSC boundary as strings.
  from: string | null;
  to: string | null;
  who: string; // the person's name if known, else their email; the audit always keeps the email
  changedAt: Date;
};

// One JSON shape covers every action; only value edits carry a from/to.
type ValueChange = { value?: { from: string | null; to: string | null } };

const MAX_ROWS = 100;

export async function loadEntryChanges(
  companyId: string,
  facilityId: string | null,
  year: number | null,
): Promise<EntryChangeRow[]> {
  if (!facilityId || year === null) return [];

  // Resolve the reporting year. The [facilityId, year] pair is unique, and companyId is checked
  // so a caller cannot read another tenant's log by guessing a facilityId.
  const reportingYear = await prisma.reportingYear.findFirst({
    where: { facilityId, year, companyId },
    select: { id: true },
  });
  if (!reportingYear) return [];

  const rows = await prisma.activityEntryChange.findMany({
    where: { reportingYearId: reportingYear.id, companyId },
    orderBy: { changedAt: "desc" },
    take: MAX_ROWS,
    select: {
      id: true,
      action: true,
      scope: true,
      element: true,
      month: true,
      changes: true,
      changedByEmail: true,
      changedAt: true,
      changedBy: { select: { name: true } },
    },
  });

  return rows.map((r) => {
    const value = (r.changes as ValueChange).value;
    return {
      id: r.id,
      action: r.action,
      scope: r.scope,
      element: r.element,
      month: r.month,
      from: value?.from ?? null,
      to: value?.to ?? null,
      // The name is nicer, but the email is the reliable identifier the audit always retains,
      // even after the account is deleted (changedBy becomes null, changedByEmail survives).
      who: r.changedBy?.name?.trim() || r.changedByEmail,
      changedAt: r.changedAt,
    };
  });
}
