import "server-only";
import { prisma } from "@/lib/prisma";
import { resolveAdminScope } from "@/lib/auth/company-scope";
import type { EntryChangeAction, Scope, Prisma } from "@/lib/generated/prisma/client";

// The cross-company, human-readable data-entry audit for CECODES admins. Unlike the company
// facing per-sede-year log (src/features/preview), this spans every tenant, so it authorizes
// itself: resolveAdminScope() throws for anyone who is not an active admin. A cross-tenant read
// is exactly what an admin is allowed here, so there is no companyId to scope to, but the guard
// still has to run because this is reachable from a page whose layout guard is not a boundary.

export type TraceabilityRow = {
  id: string;
  action: EntryChangeAction;
  scope: Scope;
  element: string;
  month: number | null;
  // Value edits carry from/to; Decimals were serialized to strings at write time.
  from: string | null;
  to: string | null;
  // COPIED carries how many empty months were filled.
  copiedMonths: number | null;
  companyId: string;
  companyName: string;
  facilityName: string | null;
  year: number | null;
  // Prefer the person's name; the email always survives, even after the account is deleted.
  actorName: string | null;
  actorEmail: string;
  actorPosition: string | null;
  actorPhone: string | null;
  changedAt: Date;
};

export type TraceabilityFilters = {
  companyId?: string;
  changedById?: string;
  from?: Date;
  to?: Date;
  page?: number;
  pageSize?: number;
};

export type TraceabilityPage = {
  rows: TraceabilityRow[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

const DEFAULT_PAGE_SIZE = 20;

// The JSON shapes the four write sites produce (src/features/data-entry/actions/entries.ts).
type ChangesJson = {
  value?: { from: string | null; to: string | null } | string;
  months?: number;
  removed?: { month: number | null; value: string }[];
};

export async function loadAdminTraceability(
  filters: TraceabilityFilters = {},
): Promise<TraceabilityPage> {
  await resolveAdminScope();

  const pageSize = filters.pageSize ?? DEFAULT_PAGE_SIZE;

  const where: Prisma.ActivityEntryChangeWhereInput = {};
  if (filters.companyId) where.companyId = filters.companyId;
  if (filters.changedById) where.changedById = filters.changedById;
  if (filters.from || filters.to) {
    where.changedAt = {};
    if (filters.from) where.changedAt.gte = filters.from;
    if (filters.to) where.changedAt.lte = filters.to;
  }

  const total = await prisma.activityEntryChange.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(1, filters.page ?? 1), pageCount);

  const rows = await prisma.activityEntryChange.findMany({
    where,
    orderBy: { changedAt: "desc" },
    skip: (page - 1) * pageSize,
    take: pageSize,
    select: {
      id: true,
      action: true,
      scope: true,
      element: true,
      month: true,
      changes: true,
      companyId: true,
      changedByEmail: true,
      changedAt: true,
      changedBy: { select: { name: true, position: true, phone: true } },
      // Bound to the row by the composite FK, so it is always present and same-tenant.
      reportingYear: {
        select: { year: true, facility: { select: { name: true, company: { select: { name: true } } } } },
      },
    },
  });

  return {
    rows: rows.map((r): TraceabilityRow => {
      const c = (r.changes ?? {}) as ChangesJson;
      const value = typeof c.value === "object" ? c.value : null;
      return {
        id: r.id,
        action: r.action,
        scope: r.scope,
        element: r.element,
        month: r.month,
        from: value?.from ?? null,
        to: value?.to ?? null,
        copiedMonths: typeof c.months === "number" ? c.months : null,
        companyId: r.companyId,
        companyName: r.reportingYear.facility.company.name,
        facilityName: r.reportingYear.facility.name,
        year: r.reportingYear.year,
        actorName: r.changedBy?.name ?? null,
        actorEmail: r.changedByEmail,
        actorPosition: r.changedBy?.position ?? null,
        actorPhone: r.changedBy?.phone ?? null,
        changedAt: r.changedAt,
      };
    }),
    total,
    page,
    pageSize,
    pageCount,
  };
}

export type TraceabilityFilterOptions = {
  companies: { id: string; name: string }[];
  people: { id: string; name: string | null; email: string; position: string | null }[];
};

// The dropdown options: only companies and people that actually appear in the log, so a filter
// never offers a choice that returns nothing.
export async function loadTraceabilityFilterOptions(): Promise<TraceabilityFilterOptions> {
  await resolveAdminScope();

  const companyIdRows = await prisma.activityEntryChange.findMany({
    distinct: ["companyId"],
    select: { companyId: true },
  });
  const companyIds = companyIdRows.map((row) => row.companyId);

  const [companies, people] = await Promise.all([
    prisma.company.findMany({
      where: { id: { in: companyIds } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.appUser.findMany({
      where: { entryChanges: { some: {} } },
      select: { id: true, name: true, email: true, position: true },
      orderBy: [{ name: "asc" }, { email: "asc" }],
    }),
  ]);

  return { companies, people };
}
