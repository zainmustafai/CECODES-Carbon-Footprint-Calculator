import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import type { AppUser } from "@/lib/generated/prisma/client";

// Current authenticated Supabase user, or null. Uses getUser() (validates the token).
// Memoized per request: the shell layout, the admin layout, the page and each action all
// ask for it, and one round trip is enough.
export const getUser = cache(async (): Promise<User | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

// Server-side guard for protected pages/layouts: redirects to /login when unauthenticated.
export async function requireUser(): Promise<User> {
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
