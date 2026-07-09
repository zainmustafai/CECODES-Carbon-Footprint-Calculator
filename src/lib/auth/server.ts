import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import type { AppUser } from "@/lib/generated/prisma/client";

// Current authenticated Supabase user, or null. Uses getUser() (validates the token).
export async function getUser(): Promise<User | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

// Server-side guard for protected pages/layouts: redirects to /login when unauthenticated.
export async function requireUser(): Promise<User> {
  const user = await getUser();
  if (!user) redirect("/login");
  return user;
}

// The current user's app profile (role + companyId), or null when not signed in.
export async function getAppUser(): Promise<AppUser | null> {
  const user = await getUser();
  if (!user) return null;
  return prisma.appUser.findUnique({ where: { id: user.id } });
}

// Guarantees a session (redirects to /login if unauthenticated). Returns null
// only when the session exists but the profile row is not present yet.
export async function requireAppUser(): Promise<AppUser | null> {
  const user = await requireUser();
  return prisma.appUser.findUnique({ where: { id: user.id } });
}
