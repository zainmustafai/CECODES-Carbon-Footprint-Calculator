import { prisma } from "@/lib/prisma";
import {
  IP_MAX_ATTEMPTS,
  MAX_ATTEMPTS,
  isLockedOut,
  registerFailure,
  type ThrottleState,
} from "./throttle-policy";

// Storage for the sign-in throttle. The arithmetic is in throttle-policy.ts; this file only reads
// a row, applies it, and writes the result back.
//
// Postgres rather than process memory because the counter has to outlive a container restart and
// hold across replicas. It costs one small indexed read per sign-in and one write per failure,
// which is nothing next to the round trip to Supabase it guards.

/**
 * The keys one sign-in attempt counts against.
 *
 * Two of them, because they answer different attacks. The address key stops a run against one
 * account from anywhere; the IP key stops a run against many accounts from one place, which the
 * address key alone would never see. The address is lowercased so casing cannot mint a fresh
 * allowance, and an unknown IP simply contributes no key rather than lumping every unknown
 * caller into one shared bucket that any single attacker could lock for everyone.
 */
export function signInThrottleKeys(email: string, ip: string | null): string[] {
  const keys = [`email:${email.trim().toLowerCase()}`];
  if (ip) keys.push(`ip:${ip}`);
  return keys;
}

/**
 * The keys a request for a password-reset LINK counts against. A separate allowance, deliberately.
 *
 * The reset request used to count against the sign-in keys, so that neither endpoint could be used
 * to refill the other's allowance. That property is kept here for free (nothing on the reset path
 * clears a sign-in key; only consuming a real link does, which takes control of the mailbox), and
 * sharing bought a failure mode instead: five presses of "Solicitar un enlace nuevo" locked the
 * address out of /login for fifteen minutes, and the person doing the pressing is by definition
 * someone who cannot sign in. They locked themselves out by asking for the way back in.
 *
 * Under the Supabase providers that would have been worse still, because nothing there lifts the
 * lock: resetPasswordWithTokenAction refuses outside local mode, so the recovery that GoTrue mails
 * never reaches clearSignInThrottle, and this deployment's GoTrue may not send mail at all
 * (user-actions.ts, resetUserPassword: "a recovery mail may simply never arrive").
 *
 * The prefix rather than a separate table: one store, one policy, and the rows still prune the
 * same way. registerFailure's per-key limit reads the shape below, so an ip key stays an ip key.
 */
export function passwordResetThrottleKeys(email: string, ip: string | null): string[] {
  return signInThrottleKeys(email, ip).map((key) => `reset:${key}`);
}

/** Whether a key counts an address (one person) or an IP (a whole office). See IP_MAX_ATTEMPTS. */
function limitFor(key: string): number {
  return key.replace(/^reset:/, "").startsWith("ip:") ? IP_MAX_ATTEMPTS : MAX_ATTEMPTS;
}

export async function isSignInThrottled(keys: string[], now = new Date()): Promise<boolean> {
  if (keys.length === 0) return false;
  const rows = await prisma.authThrottle.findMany({
    where: { key: { in: keys } },
    select: { attempts: true, windowStartedAt: true, lockedUntil: true },
  });
  return rows.some((row) => isLockedOut(row, now));
}

/**
 * Counts one failed attempt against every key.
 *
 * Read-then-write, not an atomic increment: two attempts landing in the same millisecond can read
 * the same state and cost one attempt instead of two. That is a deliberate trade. An attacker
 * cannot use it to get more than a handful of extra guesses (each racing pair still burns one),
 * and the alternative - an upsert that increments in SQL - cannot express "restart the window if
 * the old one expired" without a second round trip anyway.
 */
export async function recordSignInFailure(keys: string[], now = new Date()): Promise<void> {
  if (keys.length === 0) return;

  const current = await prisma.authThrottle.findMany({
    where: { key: { in: keys } },
    select: { key: true, attempts: true, windowStartedAt: true, lockedUntil: true },
  });
  const byKey = new Map(current.map((row) => [row.key, row]));

  for (const key of keys) {
    // An IP is shared by a whole office; an address is one person. They cannot share a limit.
    const next: ThrottleState = registerFailure(byKey.get(key) ?? null, now, limitFor(key));
    await prisma.authThrottle.upsert({
      where: { key },
      create: { key, ...next },
      update: next,
    });
  }
}

/**
 * Forgets every key after a successful sign-in.
 *
 * The IP key goes too. A shared office address otherwise accumulates its colleagues' typos until
 * it locks a building full of legitimate users out, and an IP that just proved it holds a valid
 * password is not the one being brute-forced. The deleted count is not checked, because this is
 * not a tenant-scoped write: nothing was found is the ordinary case.
 */
export async function clearSignInThrottle(keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  await prisma.authThrottle.deleteMany({ where: { key: { in: keys } } });
}
