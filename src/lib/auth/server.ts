import { cache } from "react";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SESSION_COOKIE, readSession } from "@/lib/auth/session";
import { authProvider } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import type { AppUser } from "@/lib/generated/prisma/client";

/**
 * What a cookie resolves to, whoever checked it.
 *
 * Deliberately narrower than the Supabase User. An id and an address are the only two fields
 * anything downstream has ever read, and they are the only two a self-hosted session can produce.
 * Keeping the wide type would go on advertising app_metadata, identities and confirmed_at to
 * every consumer, and the day AUTH_PROVIDER flips to "local" those fields stop existing without
 * the compiler saying a word.
 */
export type AuthUser = { id: string; email: string };

/**
 * The current authenticated user, or null. The one place a cookie becomes an identity.
 *
 * Which cookie decides is the provider's call (see AuthProvider in lib/env.ts). "local" reads our
 * own session cookie; "supabase" and "shadow" both ask GoTrue, because shadow mode double-checks
 * a PASSWORD at sign-in and nothing else. It issues no local session, so there is nothing here for
 * it to read, and identity has to move in one step anyway: two halves of the same request must not
 * be able to disagree about who is signed in.
 *
 * Memoized per request: the shell layout, the admin layout, the page and each action all ask for
 * it, and one round trip is enough.
 */
export const getUser = cache(async (): Promise<AuthUser | null> => {
  if (authProvider() === "local") {
    const token = (await cookies()).get(SESSION_COOKIE)?.value;
    return readSession(token);
  }

  const supabase = await createClient();
  // getUser() rather than getSession(): it validates the token with the auth server instead of
  // trusting what the cookie claims.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // Supabase types email as optional, because a phone-only or anonymous account has none. This
  // app has no such account and no way to serve one: every user here is created from an address,
  // and company-scope.ts carries that address into the audit trail of every write. Letting one
  // through would mean inventing an empty address for it, so it is refused instead.
  if (!user.email) return null;

  return { id: user.id, email: user.email };
});

// Server-side guard for protected pages/layouts: redirects to /login when unauthenticated.
export async function requireUser(): Promise<AuthUser> {
  const user = await getUser();
  if (!user) redirect("/login");
  return user;
}

// The current user's app profile (role + companyId), or null when not signed in.
export const getAppUser = cache(async (): Promise<AppUser | null> => {
  const user = await getUser();
  if (!user) return null;
  return prisma.appUser.findUnique({ where: { id: user.id } });
});

// Guarantees a session (redirects to /login if unauthenticated). Returns null
// only when the session exists but the profile row is not present yet.
//
// A deactivated user is sent to /account-disabled. Doing it here covers every authenticated
// page in one place. That route must NOT call this function, or it would redirect to itself.
export async function requireAppUser(): Promise<AppUser | null> {
  await requireUser();
  const appUser = await getAppUser();
  if (appUser && !appUser.active) redirect("/account-disabled");
  return appUser;
}

// Guarantees an authenticated CECODES admin. Everyone else gets a 404 rather than a
// redirect: a 404 does not confirm that the admin area exists, and it cannot loop.
//
// This protects rendering only. Server Actions are independent POST endpoints that never
// run a layout, so every admin action must call resolveAdminScope() (or resolveCompanyScope)
// itself.
export async function requireAdmin(): Promise<AppUser> {
  const appUser = await requireAppUser();
  if (!appUser || !appUser.active || appUser.role !== "CECODES_ADMIN") notFound();
  return appUser;
}

// Whether a company is still active. Company-user pages render CompanyInactiveScreen when
// this is false; the server actions refuse independently, inside resolveCompanyScope.
// Memoized per request because the shell and the page both ask.
export const companyIsActive = cache(async (companyId: string): Promise<boolean> => {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { active: true },
  });
  return company?.active ?? false;
});
