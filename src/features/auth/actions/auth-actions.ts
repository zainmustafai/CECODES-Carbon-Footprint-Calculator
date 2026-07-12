"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { isEmailInUse } from "../lib/errors";

// Server-side origin for email redirect links.
async function siteOrigin() {
  const h = await headers();
  const origin = h.get("origin");
  if (origin) return origin;
  const host = h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "http";
  return host ? `${proto}://${host}` : "";
}

// All error results are translation KEYS (auth.errors.*); the client hook translates them.

export async function signInAction(input: {
  email: string;
  password: string;
}): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(input);
  if (error) return { error: "invalidCredentials" };

  // A deactivated account keeps working credentials, so refuse at the front door and say so
  // plainly. This is UX, not the security boundary: requireAppUser and the scope resolvers
  // re-read `active` on every request, which is what actually stops a live session.
  if (data.user) {
    const profile = await prisma.appUser.findUnique({
      where: { id: data.user.id },
      select: { active: true },
    });
    if (profile && !profile.active) {
      await supabase.auth.signOut();
      return { error: "accountDisabled" };
    }
  }

  return {};
}

export async function signUpAction(input: {
  email: string;
  password: string;
}): Promise<{ error?: string; needsConfirmation?: boolean }> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: { emailRedirectTo: `${await siteOrigin()}/auth/callback` },
  });
  if (error) return { error: isEmailInUse(error) ? "emailInUse" : "generic" };
  return { needsConfirmation: !data.session };
}

export async function requestPasswordResetAction(email: string): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${await siteOrigin()}/auth/callback?next=/reset-password`,
  });
  // Intentionally no result - never reveal whether the account exists.
}

export async function updatePasswordAction(
  password: string,
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: "generic" };
  return {};
}

export async function signOutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
}
