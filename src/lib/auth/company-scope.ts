import { prisma } from "@/lib/prisma";
import { getAppUser, getUser } from "@/lib/auth/server";
import type { AppUser } from "@/lib/generated/prisma/client";

// Prisma connects as the Postgres owner and therefore BYPASSES the RLS policies in
// prisma/migrations/20260709120320_rls_and_auth. Those policies are inert at runtime.
// Per-company isolation is enforced here, in server code, plus by the DB constraints
// added in the data-entry migration. This module is the ONLY place the
// admin-versus-company-user decision is made.
//
// Where it is actually called, precisely (the docs used to overstate this):
//   - EVERY Server Action that touches tenant data calls a resolver here FIRST. Actions are
//     public POST endpoints that run no layout, so this is the only thing protecting them.
//   - Pages do NOT call it. They guard with requireAppUser()/requireAdmin() and pass a
//     companyId down (from the session for company routes, from the URL for admin routes).
//     That is safe because the admin routes are admin-only and the company routes derive the
//     id from the user's own row.
//     CAUTION: loadDashboard() and loadPreview() accept a companyId and query Prisma with NO
//     authorization of their own. They are safe only because of their callers. Any new caller
//     that passes a user-supplied companyId without a guard bypasses tenant isolation.

export type ScopeErrorReason = "no-profile" | "forbidden" | "not-found";

export class ScopeError extends Error {
  constructor(public readonly reason: ScopeErrorReason) {
    super(reason);
    this.name = "ScopeError";
  }
}

export type CompanyScope = {
  appUser: AppUser;
  companyId: string;
  isAdmin: boolean;
};

// Authorizes the caller against a company id supplied by a route param or an action
// argument. Never trust that id: an admin may use any existing company, a company user
// may only use their own.
export async function resolveCompanyScope({
  companyId,
}: {
  companyId: string | null | undefined;
}): Promise<CompanyScope> {
  const appUser = await getAppUser();
  if (!appUser) throw new ScopeError("no-profile");
  // A deactivated user may still hold a valid Supabase session. The role and this flag live
  // in Postgres, not in the JWT, so refusing here is what makes deactivation immediate.
  if (!appUser.active) throw new ScopeError("forbidden");

  if (appUser.role === "CECODES_ADMIN") {
    // An admin's own companyId is null. If that null ever reached a scoped query,
    // Prisma would emit `WHERE "companyId" IS NULL`, which matches nothing rather than
    // everything. So an admin must always name an existing company explicitly.
    if (!companyId) throw new ScopeError("not-found");
    const exists = await prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true },
    });
    if (!exists) throw new ScopeError("not-found");
    // Deliberately no `active` check here: an admin must be able to open an inactive
    // company in order to fix and reactivate it.
    return { appUser, companyId, isAdmin: true };
  }

  if (!appUser.companyId) throw new ScopeError("no-profile"); // not onboarded yet
  if (companyId && companyId !== appUser.companyId) throw new ScopeError("forbidden");

  const company = await prisma.company.findUnique({
    where: { id: appUser.companyId },
    select: { active: true },
  });
  if (!company) throw new ScopeError("not-found");
  if (!company.active) throw new ScopeError("forbidden");

  return { appUser, companyId: appUser.companyId, isAdmin: false };
}

export type OnboardingScope = {
  userId: string;
  email: string;
  /** Null when the signup trigger has not written the profile row yet. */
  appUser: AppUser | null;
};

// Onboarding is the one flow that runs BEFORE a company exists, so resolveCompanyScope cannot
// apply: there is no companyId to authorize against. It still belongs in this module, because
// this is the only place that decides who may act.
//
// The check that matters is `active`. A deactivated user may still hold a valid Supabase
// session, and createCompanyAction is a public POST endpoint that runs no layout, so the
// /account-disabled redirect in requireAppUser never fires for it. Without this guard a
// deactivated user who was never onboarded could create a company and link themselves to it.
export async function resolveOnboardingScope(): Promise<OnboardingScope> {
  const user = await getUser();
  if (!user) throw new ScopeError("no-profile");

  const appUser = await getAppUser();
  // A missing profile row is legitimate here: the signup trigger may not have run, and the
  // action self-heals it. A profile that exists and is deactivated is not legitimate.
  if (appUser && !appUser.active) throw new ScopeError("forbidden");

  // Already having a company is NOT an authorization failure; the caller reports it as
  // "alreadyOnboarded". Authorization stops here.
  return { userId: user.id, email: user.email ?? "", appUser };
}

export type AdminScope = { appUser: AppUser };

// The action-level admin guard. `requireAdmin()` in lib/auth/server.ts calls notFound(),
// which is right for a page and useless inside a Server Action. Every admin action calls
// this first, so the admin-versus-company-user decision stays in this one module.
export async function resolveAdminScope(): Promise<AdminScope> {
  const appUser = await getAppUser();
  if (!appUser) throw new ScopeError("no-profile");
  if (!appUser.active || appUser.role !== "CECODES_ADMIN") {
    throw new ScopeError("forbidden");
  }
  return { appUser };
}

export type ReportingYearScope = CompanyScope & {
  reportingYear: {
    id: string;
    companyId: string;
    facilityId: string;
    year: number;
    gwpSet: "AR5" | "AR6";
  };
};

// For actions keyed on a reporting year. The company is derived FROM THE ROW and then
// authorized, so a user of company A cannot pass their own companyId alongside company
// B's reportingYearId.
export async function resolveReportingYearScope(
  reportingYearId: string,
): Promise<ReportingYearScope> {
  const row = await prisma.reportingYear.findUnique({
    where: { id: reportingYearId },
    select: { id: true, companyId: true, facilityId: true, year: true, gwpSet: true },
  });
  if (!row) throw new ScopeError("not-found");
  const scope = await resolveCompanyScope({ companyId: row.companyId });
  return { ...scope, reportingYear: row };
}

// For actions keyed on a facility.
export async function resolveFacilityScope(facilityId: string): Promise<CompanyScope> {
  const facility = await prisma.facility.findUnique({
    where: { id: facilityId },
    select: { companyId: true },
  });
  if (!facility) throw new ScopeError("not-found");
  return resolveCompanyScope({ companyId: facility.companyId });
}

// Server actions map every ScopeError to a single opaque key so the response never
// reveals whether a resource exists.
export function scopeErrorKey(error: unknown): string {
  return error instanceof ScopeError ? "forbidden" : "generic";
}
