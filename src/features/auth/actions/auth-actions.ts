"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { FEATURE_SELF_ONBOARDING } from "@/lib/feature-flags";
import { resolveSiteOrigin } from "@/lib/site-url";
import {
  clearSignInThrottle,
  isSignInThrottled,
  recordSignInFailure,
  signInThrottleKeys,
} from "@/lib/auth/throttle";
import {
  emailInput,
  passwordInput,
  signInInput,
  signUpInput,
} from "../schemas/auth-server-schemas";
import { isEmailInUse } from "../lib/errors";

// Server-side origin for email redirect links. Pinned to configuration, never to the request's
// Host header: see src/lib/site-url.ts for the injection this closes.
async function siteOrigin() {
  const h = await headers();
  return resolveSiteOrigin(
    {
      siteUrl: process.env.SITE_URL,
      domain: process.env.DOMAIN,
      vercelUrl: process.env.VERCEL_URL,
      nodeEnv: process.env.NODE_ENV,
    },
    { host: h.get("host"), forwardedProto: h.get("x-forwarded-proto") },
  );
}

/**
 * The caller's address, for the sign-in throttle.
 *
 * x-forwarded-for is a client-settable header, so its value cannot be trusted as identity. It
 * does not need to be: a forged one buys an attacker a fresh throttle bucket but never lifts the
 * lock on the address being attacked, which is the key that matters. The FIRST hop is used
 * because that is where a proxy appends the real client; a long or malformed value is dropped
 * rather than stored, so a crafted header cannot write junk rows.
 */
async function requestIp(): Promise<string | null> {
  const forwarded = (await headers()).get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  if (!first || first.length > 45) return null; // 45 = longest possible IPv6 text form
  return /^[0-9a-fA-F.:]+$/.test(first) ? first : null;
}

// All error results are translation KEYS (auth.errors.*); the client hook translates them.

export async function signInAction(input: {
  email: string;
  password: string;
}): Promise<{ error?: string }> {
  const parsed = signInInput.safeParse(input);
  if (!parsed.success) return { error: "invalidInput" };

  // Before the password is forwarded, not after: the point is to stop Supabase from being asked
  // at all. Its own per-IP protection sees this server's IP for every user in the system, so it
  // cannot tell one company's staff apart from a script working through a password list.
  const throttleKeys = signInThrottleKeys(parsed.data.email, await requestIp());
  if (await isSignInThrottled(throttleKeys)) return { error: "tooManyAttempts" };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    await recordSignInFailure(throttleKeys);
    return { error: "invalidCredentials" };
  }

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
      // Not a failed attempt: the password was right. Counting it would let a deactivated user
      // lock out the address they may later be reactivated on.
      return { error: "accountDisabled" };
    }
  }

  await clearSignInThrottle(throttleKeys);
  return {};
}

export async function signUpAction(input: {
  email: string;
  password: string;
}): Promise<{ error?: string; needsConfirmation?: boolean }> {
  // Server Actions are public POST endpoints, so the gate lives here, not only in the UI:
  // hiding the /register page does nothing against a hand-crafted request.
  if (!FEATURE_SELF_ONBOARDING) return { error: "registrationDisabled" };

  const parsed = signUpInput.safeParse(input);
  if (!parsed.success) return { error: "invalidInput" };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { emailRedirectTo: `${await siteOrigin()}/auth/callback` },
  });
  if (error) return { error: isEmailInUse(error) ? "emailInUse" : "generic" };
  return { needsConfirmation: !data.session };
}

export async function requestPasswordResetAction(email: string): Promise<void> {
  // A malformed address returns exactly what a valid one does: nothing. Reporting the rejection
  // would turn this into an address validator for anyone probing it.
  const parsed = emailInput.safeParse(email);
  if (!parsed.success) return;

  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(parsed.data, {
    redirectTo: `${await siteOrigin()}/auth/callback?next=/reset-password`,
  });
  // Intentionally no result - never reveal whether the account exists.
}

export async function updatePasswordAction(
  password: string,
): Promise<{ error?: string }> {
  // This is where the 8-character minimum is actually enforced. Supabase's own floor is 6.
  const parsed = passwordInput.safeParse(password);
  if (!parsed.success) return { error: "invalidInput" };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data });
  if (error) return { error: "generic" };
  return {};
}

export async function signOutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
}
