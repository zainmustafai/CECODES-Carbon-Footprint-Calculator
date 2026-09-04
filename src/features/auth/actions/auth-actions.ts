"use server";

import { cookies, headers } from "next/headers";
import { after } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { FEATURE_SELF_ONBOARDING } from "@/lib/feature-flags";
import { authProvider, mailConfigured } from "@/lib/env";
import { resolveSiteOrigin } from "@/lib/site-url";
import { getUser } from "@/lib/auth/server";
import { hashPassword, needsRehash, verifyPassword } from "@/lib/auth/password";
import {
  SESSION_COOKIE,
  createSession,
  destroySession,
  hashToken,
  sessionCookieOptions,
} from "@/lib/auth/session";
import {
  clearSignInThrottle,
  isSignInThrottled,
  passwordResetThrottleKeys,
  recordSignInFailure,
  signInThrottleKeys,
} from "@/lib/auth/throttle";
import { passwordResetEmail } from "@/lib/mail/password-reset-email";
import { sendMail } from "@/lib/mail/send";
import { reportError } from "@/lib/observability/report-error";
import {
  checkedPasswordInput,
  emailInput,
  passwordInput,
  signInInput,
  signUpInput,
} from "../schemas/auth-server-schemas";
import { isEmailInUse } from "../lib/errors";

// Every door into the application, and the one file that knows which credential store is behind
// them. The three modes are defined on authProvider() in src/lib/env.ts; what matters here is that
// each action asks for the mode at the moment it runs rather than at import, because the variable
// arrives with the container and a value frozen at module load would survive a restart that was
// meant to change it. Reading it per call is also what lets one test drive all three.
//
// The shape every mode shares: validate first, throttle second, and only then let a provider see a
// password. What differs is who answers "is this the right password", and in local mode, who
// issues the cookie afterwards.

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
 * The LAST hop, and that is the whole of this function's correctness. x-forwarded-for is a list
 * that each proxy APPENDS to: a request arriving at Caddy already carrying
 * "X-Forwarded-For: 1.2.3.4" reaches this app as "1.2.3.4, <the real client>". So the leftmost
 * value is whatever the caller typed and the rightmost is the one the proxy in front of us wrote.
 *
 * This used to read the first element while its comment argued that a proxy appends, which is the
 * two halves of the same sentence disagreeing. The cost of the old reading was that IP_MAX_ATTEMPTS
 * was opt-in: one header minted a fresh bucket per request, or (with a value the regex rejects) no
 * IP key at all, and the same header pointed a lockout at a member company's office address.
 *
 * The caveat this reading carries instead: it assumes exactly ONE trusted proxy. Put a second one
 * in front (a CDN ahead of Caddy) and every user shares that proxy's address, so IP_MAX_ATTEMPTS
 * would lock the whole deployment. The single-proxy shape is what docker-compose.yml and the
 * Caddyfile deploy, and it is what Vercel presents.
 *
 * A long or malformed value is still dropped rather than stored, so a crafted header cannot write
 * junk rows, and contributing no key is safer than lumping every unknown caller into one bucket
 * that a single attacker could lock for everyone.
 */
async function requestIp(): Promise<string | null> {
  const hops = (await headers()).get("x-forwarded-for")?.split(",") ?? [];
  const nearest = hops.at(-1)?.trim();
  if (!nearest || nearest.length > 45) return null; // 45 = longest possible IPv6 text form
  return /^[0-9a-fA-F.:]+$/.test(nearest) ? nearest : null;
}

/**
 * The one spelling of an address this app ever looks a row up by.
 *
 * app_users.email is unique and lowercase: GoTrue lowercased everything it wrote, and every path
 * that writes the column now does the same (see admin/schemas/user-schemas.ts). A lookup that
 * skipped this would refuse a user for capitalising their own address, and would refuse it with
 * the same key a wrong password gets, which makes it a support ticket nobody can reproduce. The
 * throttle keys are built the same way, so casing cannot mint a fresh allowance either.
 */
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// All error results are translation KEYS (auth.errors.*); the client hook translates them.

export async function signInAction(input: {
  email: string;
  password: string;
}): Promise<{ error?: string }> {
  const parsed = signInInput.safeParse(input);
  if (!parsed.success) return { error: "invalidInput" };

  // Everything below this line is wrapped, and the reason is what the login form does with a throw
  // rather than what the throw itself costs. An unhandled rejection out of a Server Action never
  // reaches use-login.ts, which only ever reads the returned error key: the spinner stops and the
  // screen says nothing at all, which is the exact failure resetPasswordWithTokenAction already
  // takes pains to avoid. Every other auth path here already had a boundary; this one, the busiest,
  // had none, so any database blip during sign-in was a silent form.
  //
  // "generic" and not a more specific key: whatever failed is a fact about this deployment, and an
  // unauthenticated caller learns nothing from it.
  try {
    const ip = await requestIp();

    // Before the password is checked, not after: the point is to stop the credential store from
    // being asked at all. Supabase's own per-IP protection sees this server's IP for every user in
    // the system, so it cannot tell one company's staff apart from a script working through a
    // password list. Local mode has no upstream protection to lean on at all, and every attempt
    // there spends a quarter of a second of this server's CPU on bcrypt, so an unmetered endpoint
    // would be a denial of service lever as well as a guessing one.
    const throttleKeys = signInThrottleKeys(parsed.data.email, ip);
    if (await isSignInThrottled(throttleKeys)) return { error: "tooManyAttempts" };

    if (authProvider() === "local") return await signInLocally(parsed.data, throttleKeys, ip);
    return await signInThroughSupabase(parsed.data, throttleKeys);
  } catch (error) {
    // No address, ever. "who tried to sign in" is the fact these logs must not carry, for the
    // reason src/lib/mail/send.ts gives, and it is the one field a caller controls here.
    reportError({ where: "auth/sign-in", error });
    return { error: "generic" };
  }
}

/** Today's sign-in, and shadow mode's: GoTrue decides, and nothing else is allowed to. */
async function signInThroughSupabase(
  credentials: { email: string; password: string },
  throttleKeys: string[],
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(credentials);

  if (authProvider() === "shadow") await recordShadowVerdict(credentials, !error);

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

/**
 * Shadow mode, in full: check the local hash beside the verdict GoTrue just gave, and write a log
 * line only when the two disagree.
 *
 * This is how the backfill earns trust before anything depends on it. A hash that came across
 * wrong costs a line in the log here, where it can be found and fixed, instead of locking someone
 * out on the day the provider is switched. Silence is the result worth having: it means the two
 * stores agree on every sign-in the app actually sees.
 *
 * Nothing in here can change the outcome, and the whole body is wrapped so that it cannot even
 * fail one. An observation that can refuse a sign-in Supabase accepted is worse than no
 * observation, because it would be discovered by users rather than by this log.
 *
 * The line carries the user id and the two booleans. Not the address, which is the fact these logs
 * must not carry (src/lib/mail/send.ts argues the same point), and never the password or the hash.
 */
async function recordShadowVerdict(
  credentials: { email: string; password: string },
  supabaseAccepted: boolean,
): Promise<void> {
  try {
    const user = await prisma.appUser.findUnique({
      where: { email: normalizeEmail(credentials.email) },
      select: { id: true, passwordHash: true, passwordAlgo: true },
    });
    const localAccepted = await verifyPassword(
      credentials.password,
      user?.passwordHash,
      user?.passwordAlgo,
    );
    if (localAccepted === supabaseAccepted) return;

    reportError({
      where: "auth/shadow-verdict",
      error: new Error("local password verdict disagrees with the Supabase verdict"),
      // A null id is itself a disagreement worth seeing: GoTrue holds an account app_users has
      // never heard of, which no amount of rehashing would fix.
      context: { userId: user?.id ?? null, supabaseAccepted, localAccepted },
    });
  } catch (error) {
    reportError({ where: "auth/shadow-verdict", error });
  }
}

/** Self-hosted sign-in. Supabase is never asked, and this function issues the session cookie. */
async function signInLocally(
  credentials: { email: string; password: string },
  throttleKeys: string[],
  ip: string | null,
): Promise<{ error?: string }> {
  const user = await prisma.appUser.findUnique({
    where: { email: normalizeEmail(credentials.email) },
    select: { id: true, active: true, passwordHash: true, passwordAlgo: true },
  });

  // Called even when nothing matched, and handed the null hash on purpose: verifyPassword spends
  // the same bcrypt work against a dummy hash (see DUMMY_HASH in src/lib/auth/password.ts), so an
  // address with no account takes as long to refuse as an account with the wrong password.
  // Returning early here would answer in under a millisecond and hand out an account enumeration
  // oracle that one shared error key does nothing to close.
  //
  // It is also what refuses a row whose passwordHash is null, the state every backfilled and every
  // invited account passes through. Such a row is an account that CANNOT authenticate, never one
  // that needs no password, and this path must never grow a branch that reads it the other way.
  const accepted = await verifyPassword(
    credentials.password,
    user?.passwordHash,
    user?.passwordAlgo,
  );

  // One key for both, because "no such address" and "wrong password" are the same answer to
  // anyone who is not the account holder.
  if (!user || !accepted) {
    await recordSignInFailure(throttleKeys);
    return { error: "invalidCredentials" };
  }

  if (!user.active) {
    // The same rule the Supabase path follows, for the same two reasons: no session is issued, and
    // the attempt is not counted, because the password was right and counting it would let a
    // deactivated user lock out the address they may later be reactivated on.
    return { error: "accountDisabled" };
  }

  // The rehash rides along with lastSignInAt rather than taking a write of its own. A successful
  // sign-in is the only moment the plaintext and the stored hash are both in hand, so it is the
  // only moment a legacy hash can be raised to the cost this app writes today. That is worth more
  // than the policy compliance it looks like: until the last low-cost row is upgraded, a wrong
  // password against one of them answers faster than the dummy hash does, and being fast is itself
  // the signal that an address has an account behind it (needsRehash in password.ts spells the
  // arithmetic out). This drains that population one sign-in at a time.
  const upgraded = needsRehash(user.passwordHash)
    ? await hashPassword(credentials.password)
    : null;
  const { count } = await prisma.appUser.updateMany({
    // `active: true` is re-stated here, not carried over from the read above, and it is the only
    // thing standing between an admin's deactivation and a session minted a millisecond later.
    // setUserActive sweeps user_sessions in the same transaction as the flag, so a sign-in that
    // inserted its row AFTER that sweep would leave a live-looking session for an account that is
    // refused everywhere: authorization still holds (every entry point re-reads `active`), but the
    // row survives unswept, which is precisely the "cannot tell a session that would be refused
    // from one that would be honoured" state setUserActive's local branch exists to prevent.
    where: { id: user.id, active: true },
    data: {
      lastSignInAt: new Date(),
      ...(upgraded ? { passwordHash: upgraded.hash, passwordAlgo: upgraded.algo } : {}),
    },
  });
  // updateMany reports a row that was not there as success, so the count is read. Zero means the
  // account was deleted or deactivated between the lookup above and this write, and the session
  // that would follow is the worst outcome of that race: a cookie for a user nobody can
  // deactivate, because there is no longer a row to deactivate.
  if (count === 0) return { error: "invalidCredentials" };

  await clearSignInThrottle(throttleKeys);

  const { token, expiresAt } = await createSession(user.id, {
    ip,
    // Kept for support and incident review only. session.ts bounds it; nothing authorizes on it.
    userAgent: (await headers()).get("user-agent"),
  });
  // The plaintext token exists here and nowhere else from this point on: only its digest was
  // stored, so this is the last chance to hand it to the browser.
  (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));
  return {};
}

export async function signUpAction(input: {
  email: string;
  password: string;
}): Promise<{ error?: string; needsConfirmation?: boolean }> {
  // Server Actions are public POST endpoints, so the gate lives here, not only in the UI:
  // hiding the /register page does nothing against a hand-crafted request.
  if (!FEATURE_SELF_ONBOARDING) return { error: "registrationDisabled" };

  // The second gate, and it is not the same gate. GoTrue is the only store this function knows how
  // to write to, and under `local` GoTrue is not the store that decides a sign-in. An account it
  // created there would be an auth.users row with no app_users row behind it and no passwordHash
  // anywhere, and verifyPassword refuses a null hash rather than reading it as "no password
  // required" (signInLocally says so at length). So the person would be walked through a
  // registration form, told to confirm their address, and handed a password that can never open
  // the door, with nothing in the UI able to explain why.
  //
  // Refusing is the honest answer rather than the lazy one: reopening self-serve onboarding on a
  // self-hosted deployment is a change to THIS function, which has to mint the row and the hash
  // itself the way admin createUser already does, and it is not a flag flip. The flag's own
  // comment invites that flip ("Flip to true to reopen it"), which is exactly why the provider is
  // checked here and not left to whoever flips it.
  if (authProvider() === "local") return { error: "registrationDisabled" };

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

/**
 * How long an emailed reset link is good for.
 *
 * An hour, because the two failures are asymmetric. Too short and a user who reads their mail
 * after lunch asks for a second link, and the support cost of that lands on CECODES. Too long and
 * a message sitting in a mailbox goes on being a working key to the account long after the person
 * has forgotten they asked. An hour covers "find the email, open it, type a password" with room to
 * spare and little else.
 */
const RESET_TTL_MINUTES = 60;

/** 256 bits, for the reason session.ts gives: guessing is not an attack on a token this size. */
const RESET_TOKEN_BYTES = 32;

function newResetToken(): string {
  const bytes = new Uint8Array(RESET_TOKEN_BYTES);
  crypto.getRandomValues(bytes);
  // base64url so the value survives a query string untouched: no padding, no + or /.
  return Buffer.from(bytes).toString("base64url");
}

export async function requestPasswordResetAction(email: string): Promise<void> {
  // A malformed address returns exactly what a valid one does: nothing. Reporting the rejection
  // would turn this into an address validator for anyone probing it.
  const parsed = emailInput.safeParse(email);
  if (!parsed.success) return;

  if (authProvider() === "local") {
    await requestPasswordResetLocally(parsed.data);
    return;
  }

  // Metered and deferred here too, and it was neither until now. This is the branch every
  // deployment actually runs, and it was an unauthenticated endpoint that sends mail: a loop
  // against it buried whoever owns the address in reset links and drained the Supabase mail
  // allowance, with nothing counting the requests. The local branch spent a whole after() block
  // and a throttle on exactly these three problems; this one got none of it.
  const normalized = normalizeEmail(parsed.data);
  const throttleKeys = passwordResetThrottleKeys(normalized, await requestIp());
  if (await isSignInThrottled(throttleKeys)) return;
  await recordSignInFailure(throttleKeys);

  // Read before the callback, because it reads request headers and the callback runs after the
  // response has gone out.
  const redirectTo = `${await siteOrigin()}/auth/callback?next=/reset-password`;

  // After the response, for the reason the local branch gives: GoTrue does measurably more work
  // for an address it holds an account for (it composes and dispatches a message) than for one it
  // does not, and identical wording on the screen does nothing about a stopwatch.
  after(async () => {
    try {
      const supabase = await createClient();
      await supabase.auth.resetPasswordForEmail(normalized, { redirectTo });
    } catch (error) {
      // The only place a failure on this path can surface at all, now that the response is sent.
      reportError({ where: "auth/password-reset", error });
    }
  });
  // Intentionally no result - never reveal whether the account exists.
}

async function requestPasswordResetLocally(email: string): Promise<void> {
  const normalized = normalizeEmail(email);

  // Metered, because without this it is an unauthenticated endpoint that sends mail: a loop
  // against it burns the provider quota, and it buries whoever owns the address in reset links.
  //
  // Its OWN allowance, not the sign-in one it used to share. See passwordResetThrottleKeys: the
  // property the sharing was there for survives the split, and what the split removes is a user
  // locking themselves out of /login by pressing "Solicitar un enlace nuevo" five times.
  const throttleKeys = passwordResetThrottleKeys(normalized, await requestIp());
  if (await isSignInThrottled(throttleKeys)) return;

  // The two deployment guards run BEFORE the attempt is counted, and that order is the whole
  // point of them. Counting is only defensible while the endpoint has something to meter; on a
  // deployment where it can do nothing at all, the count is a lockout with nothing on the other
  // side of it. MAX_ATTEMPTS is five, so five clicks of "Solicitar un enlace nuevo" would refuse
  // this endpoint to that address for fifteen minutes, and nothing could lift it early, because
  // clearSignInThrottle only runs when a link is consumed and no link was ever issued. The user
  // would have locked themselves out by asking for the way back in.
  //
  // Neither guard reads the address, so neither can be timed to answer whether an account exists:
  // both are facts about the deployment and give every caller the same answer.
  if (!mailConfigured()) {
    // No token row is written. One that can never be delivered is a live credential sitting in the
    // table for an hour buying nobody anything. The line names the deployment problem and no
    // address, for the reason mail/send.ts gives: "who asked for a password reset" is exactly the
    // fact these logs must not carry.
    console.warn("[auth] password reset requested, but no mail is configured");
    return;
  }

  // Read here rather than inside the callback below, because it reads request headers and the
  // callback runs after the response has been sent.
  const origin = await siteOrigin();
  if (!origin) {
    // resolveSiteOrigin answers "" when SITE_URL, DOMAIN and VERCEL_URL are all unset, which is
    // the ordinary state of a self-hosted deployment: DOMAIN is commented out in .env.example and
    // the compose default of "localhost" is deliberately ignored. Sending anyway would mail
    // "/reset-password?token=..." to a mail client that has no origin to resolve it against, so
    // the link is dead on arrival while the token behind it stays live for the hour, which is the
    // same undeliverable-credential trade the mail guard above refuses. Whoever asked gets the
    // same nothing every caller gets; the log is where the deployment problem is named.
    console.warn("[auth] password reset requested, but no public origin is configured");
    return;
  }

  await recordSignInFailure(throttleKeys);

  // Everything that can differ between an address with an account and one without happens after
  // the response has gone out. A token insert plus a call to the mail provider costs a few hundred
  // milliseconds where a lookup that misses costs one, and that gap answers the question this
  // action exists to refuse to answer. Identical wording on the screen does nothing about a
  // stopwatch.
  after(async () => {
    try {
      const user = await prisma.appUser.findUnique({
        where: { email: normalized },
        select: { id: true, active: true },
      });
      // A deactivated account is refused at the front door anyway, so a link for one leads nowhere.
      if (!user || !user.active) return;

      const token = newResetToken();
      // Only the digest is written, exactly as with a session: a leaked backup of this table must
      // not hand over working reset links. The plaintext exists in the message and nowhere else.
      await prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: hashToken(token),
          expiresAt: new Date(Date.now() + RESET_TTL_MINUTES * 60 * 1000),
        },
      });

      const message = passwordResetEmail({
        resetUrl: `${origin}/reset-password?token=${encodeURIComponent(token)}`,
        expiresInMinutes: RESET_TTL_MINUTES,
      });
      // sendMail never throws, and its result is ignored on purpose: the response is long gone and
      // there is nobody left to tell. It logs its own failures.
      await sendMail({ to: normalized, ...message });
    } catch (error) {
      // The only place a failure on this path can surface at all, now that the response is sent.
      reportError({ where: "auth/password-reset", error });
    }
  });
}

/**
 * The payload of the emailed half of the reset flow.
 *
 * Kept beside the action rather than in auth-server-schemas.ts because nothing else validates a
 * reset token: it is not a field of any auth form, it is a bearer credential that happens to
 * arrive in a query string. The password rule is imported rather than restated, so there stays
 * exactly one place the policy is written down.
 */
const resetWithTokenInput = z
  .object({
    // Bounded, not shaped. A token of the wrong shape and a token that simply does not exist have
    // to get the same answer anyway, so a regex here would buy nothing; the length cap is there so
    // a megabyte of text is refused before anything hashes it.
    token: z.string().trim().min(1).max(256),
    password: passwordInput,
  })
  .strict();

export async function resetPasswordWithTokenAction(input: {
  token: string;
  password: string;
}): Promise<{ error?: string }> {
  const parsed = resetWithTokenInput.safeParse(input);
  if (!parsed.success) return { error: "invalidInput" };

  // These rows are only ever written in local mode, and outside it they decide nothing: GoTrue
  // still holds the password every supabase and shadow sign-in is checked against. Writing a hash
  // here would tell a user their password had changed while the one that opens the door had not.
  if (authProvider() !== "local") return { error: "invalidResetLink" };

  const row = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(parsed.data.token) },
    select: {
      id: true,
      userId: true,
      expiresAt: true,
      consumedAt: true,
      // The address is read for one purpose: rebuilding the throttle keys at the end of this
      // function. It is never returned, never logged and never compared against anything the
      // caller sent, because every failure below answers with one key precisely so this endpoint
      // says nothing about whose mailbox the token came from.
      //
      // `active` is read because this is a credential write and the flag has to be re-read on
      // every one of those. requestPasswordResetLocally refuses to mint a link for a deactivated
      // account, but a link minted a minute BEFORE the deactivation is still sitting in a mailbox,
      // and setUserActive retires that user's sessions without touching their outstanding links.
      // Without this the flag stops being immediate for the one thing it most needs to cover: an
      // admin deactivates a compromised account, and whoever reads its mail rewrites the password
      // anyway, ends every session the real owner still had, and clears the address's sign-in
      // lockout on the way out.
      user: { select: { email: true, active: true } },
    },
  });

  // Never issued, already spent, long expired and belonging to a deactivated account all answer
  // the same. The difference between them is a fact about somebody else's mailbox or somebody
  // else's standing, and this endpoint is reachable by anyone.
  if (!row || row.consumedAt || row.expiresAt.getTime() <= Date.now() || !row.user.active) {
    return { error: "invalidResetLink" };
  }

  // Hashed before the transaction opens. A quarter of a second of bcrypt inside one would hold a
  // row lock for that long, for work that has nothing to do with the database.
  const { hash, algo } = await hashPassword(parsed.data.password);

  try {
    const consumed = await prisma.$transaction(async (tx) => {
      const now = new Date();

      // `consumedAt: null` in the where clause is what makes the token single use, and the count
      // is what reads the result: two requests carrying the same token race in the database rather
      // than in the read above, and the loser is told zero rows changed. Trusting that read
      // instead would let a forwarded link be spent twice, which is the whole property this row
      // exists to provide.
      const { count } = await tx.passwordResetToken.updateMany({
        where: { id: row.id, consumedAt: null },
        data: { consumedAt: now },
      });
      if (count === 0) return false;

      // update, not updateMany: a user row that has vanished throws here and takes the consume
      // back with it, so the link stays usable rather than being spent on a write that never
      // landed. This is the one place in the file where a throw is the wanted behaviour.
      await tx.appUser.update({
        where: { id: row.userId },
        data: { passwordHash: hash, passwordAlgo: algo },
      });

      // Every OTHER link this account has outstanding, spent in the same breath.
      //
      // Asking twice is ordinary: nothing arrives in the first few seconds, so the user presses the
      // button again, and now two links are live for an hour each. Retiring only the one that was
      // used leaves the other one able to set a THIRD password after this reset has finished, which
      // hands the account to whoever reads that mailbox next. The message says the link "solo se
      // puede usar una vez", and a reader takes that to mean the reset is over, not that the
      // previous mail is still a working key. It is also the same argument as the session sweep
      // below: a credential minted against the old password must not outlive it.
      //
      // The count is not read. Zero means this was the only outstanding link, which is the ordinary
      // case; the write is scoped by userId either way.
      await tx.passwordResetToken.updateMany({
        where: { userId: row.userId, consumedAt: null },
        data: { consumedAt: now },
      });

      // Every session, this time. Someone resetting a password is often doing it because they
      // believe the account is not theirs alone any more, and a session opened with the old
      // password would otherwise outlive the password itself.
      //
      // Inside the transaction, and therefore NOT destroyAllSessionsForUser: that helper holds the
      // app's own client, so it would run outside this one, exactly as setUserActive and
      // resetUserPassword in features/admin/actions/user-actions.ts already explain. Running it
      // afterwards is worse here than there, because it was also outside the catch below: a failure
      // left the account holding a new password with every old session still live, and threw out of
      // a Server Action that had already succeeded.
      await tx.userSession.deleteMany({ where: { userId: row.userId } });

      return true;
    });

    if (!consumed) return { error: "invalidResetLink" };
  } catch (error) {
    // The token id, never the token: the id is meaningless to anyone who does not already hold the
    // row, and it is the only handle an operator has for reconstructing what happened.
    reportError({ where: "auth/reset-password", error, context: { tokenId: row.id } });
    return { error: "generic" };
  }

  // The same clearance a successful sign-in gets, and for the same reason.
  //
  // Someone reaching this line could not get in a moment ago, so the address is very often already
  // locked from the wrong guesses that sent them to /forgot-password in the first place. Without
  // this they set a new password, are sent to /login, type it, and are refused with "demasiados
  // intentos" by the very flow that existed to let them back in. Holding an unspent token proves
  // control of the mailbox, which is at least as strong a claim as the password that clears this
  // on the sign-in path.
  //
  // Both allowances go: the sign-in one because it is what stands between this user and /login,
  // and the reset one because they no longer need a second link. The IP keys go with them, on the
  // sign-in path's reasoning: a caller who just proved they read the account's mail is not the one
  // being brute-forced.
  //
  // Wrapped, and deliberately NOT folded into the try above, which returns "generic" on failure.
  // Everything that matters has already committed by this point: the password is the new one, the
  // token is spent and the old sessions are gone. A throw escaping here would reject a Server
  // Action that had SUCCEEDED, and the screen has no answer for that: use-reset-password.ts only
  // reads the returned error key, so the form would stop its spinner and say nothing at all while
  // the new password was live. The user would try the link again, be told it is no longer valid,
  // and reasonably conclude the reset never happened. Swallowing the failure costs them a wait
  // until the throttle window closes instead, which is the smaller of the two.
  try {
    const ip = await requestIp();
    await clearSignInThrottle([
      ...signInThrottleKeys(row.user.email, ip),
      ...passwordResetThrottleKeys(row.user.email, ip),
    ]);
  } catch (error) {
    reportError({ where: "auth/reset-password", error, context: { stage: "clear-throttle" } });
  }

  // Deliberately NOT signed in here. A reset link travels through a mailbox and mailboxes get
  // forwarded; turning the link into a session would make the message itself the credential. The
  // user proves the new password by typing it at /login, which costs one screen and closes that.
  return {};
}

/**
 * The signed-in change, which is two different flows wearing one form.
 *
 * `currentPassword` is required under `local` and meaningless under the other two, and that is not
 * an inconsistency to tidy away later. Under `local`, recovery arrives as ?token= and never as a
 * session (route-gate.ts explains the split), so a session on this action is always somebody who
 * already knows the password: asking for it costs one field and closes the "thirty seconds at an
 * unlocked laptop" takeover below. Under `supabase` and `shadow`, GoTrue's recovery link signs the
 * user in at /auth/callback and lands them here precisely BECAUSE they cannot supply the old
 * password, so demanding it would break the only recovery those providers have.
 */
const updatePasswordInput = z
  .object({
    password: passwordInput,
    currentPassword: checkedPasswordInput.optional(),
  })
  .strict();

export async function updatePasswordAction(input: {
  password: string;
  currentPassword?: string;
}): Promise<{ error?: string }> {
  // This is where the 8-character minimum is actually enforced. Supabase's own floor is 6, and
  // local mode has no floor at all beyond this line.
  const parsed = updatePasswordInput.safeParse(input);
  if (!parsed.success) return { error: "invalidInput" };

  if (authProvider() === "local") return updatePasswordLocally(parsed.data);

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { error: "generic" };

  await mirrorLocalHash(parsed.data.password);
  return {};
}

/**
 * Writes app_users.passwordHash for a password GoTrue has just accepted.
 *
 * supabase mode is defined as "the local hash column is written but never read" (AuthProvider in
 * lib/env.ts), and this was the one SIGNED-IN password change that skipped the writing half. The
 * admin rotation already does it, and says why: "The local hash is then written alongside so it
 * does not fall behind before the cutover" (features/admin/actions/user-actions.ts,
 * resetUserPassword).
 *
 * signUpAction is the one path left that sets a password without mirroring it, and it stays that
 * way on purpose rather than by omission: it is closed by FEATURE_SELF_ONBOARDING and refused
 * outright under `local`, so nothing it creates can reach a local sign-in and there is no stale
 * column for the cutover to promote. Reopening it means writing the row and the hash there, not
 * calling this.
 *
 * Skipping it costs two things, both of which surface long after the change. In shadow mode the
 * backfilled hash stops matching, so recordShadowVerdict logs a disagreement on every later
 * sign-in by that user: the one signal an operator watches for a bad backfill, now firing for a
 * reason that has nothing to do with one, on an account that is working perfectly. And on the day
 * AUTH_PROVIDER flips to local, the stale hash IS the credential: the password the user retired
 * opens the account and the one they actually use does not.
 *
 * Failure is logged and swallowed. GoTrue has already accepted the new password, so the change has
 * happened; returning an error over the mirror would tell the user to try again with a password
 * that already works. A miss leaves the column holding the previous password, which is the state
 * this function exists to drain and is no worse than not having run.
 */
async function mirrorLocalHash(password: string): Promise<void> {
  try {
    const user = await getUser();
    if (!user) return;

    const { hash, algo } = await hashPassword(password);
    const { count } = await prisma.$transaction(async (tx) => {
      const updated = await tx.appUser.updateMany({
        where: { id: user.id },
        data: { passwordHash: hash, passwordAlgo: algo },
      });

      // The local sessions and the local reset links go too, even though this provider honours
      // neither of them, and that is the point rather than an oversight.
      //
      // These rows only decide anything under `local`, so the reading used to be "not this
      // action's to revoke". What that missed is the direction of travel: AUTH_PROVIDER is one
      // variable and a rollback to `supabase` is meant to be real, so a session minted during a
      // local window sits in this table through the whole Supabase window and is honoured again
      // the moment the flag goes back. Leaving it means the password the user retired here still
      // has live sessions and live reset links waiting for it on the other side of the round trip,
      // for up to SESSION_TTL_MS. Deleting them costs nothing under this provider, because nothing
      // here reads them.
      //
      // Every session, unlike updatePasswordLocally: there is no cookie of ours to keep, because
      // this provider never issued one.
      await tx.userSession.deleteMany({ where: { userId: user.id } });
      await tx.passwordResetToken.updateMany({
        where: { userId: user.id, consumedAt: null },
        data: { consumedAt: new Date() },
      });

      return updated;
    });
    // updateMany calls a write that matched nothing a success, and here that means a GoTrue account
    // with no app_users row: a real mismatch between the two stores, and precisely what the shadow
    // log exists to surface. The id is safe to carry; the address and the hash are not.
    if (count === 0) {
      reportError({
        where: "auth/mirror-local-hash",
        error: new Error("no app_users row for the signed-in user"),
        context: { userId: user.id },
      });
    }
  } catch (error) {
    reportError({ where: "auth/mirror-local-hash", error });
  }
}

async function updatePasswordLocally({
  password,
  currentPassword,
}: {
  password: string;
  currentPassword?: string;
}): Promise<{ error?: string }> {
  // Re-established here rather than trusted to whatever rendered the form: this is a public POST
  // endpoint that changes a credential, and a page guard protects rendering only. getUser() is the
  // single answer to "who is asking" in every provider.
  const user = await getUser();
  if (!user) return { error: "sessionExpired" };

  // Re-authentication, and the session cookie is not a substitute for it.
  //
  // What this closes: whoever holds the cookie, for thirty seconds at an unlocked laptop or
  // through one injected script calling this action with the ambient credential, could set a
  // password of their choosing. The sweep below would then end every session BUT theirs and spend
  // every reset link the owner had in flight, so the account changed hands and the owner's only
  // route back was a fresh link or an admin. httpOnly does not help against the script version:
  // it never needs to read the cookie, only to send it.
  //
  // Refused with its own key rather than "invalidCredentials", because on this form the address is
  // not in question and telling the user their EMAIL might be wrong is a support call.
  const row = await prisma.appUser.findUnique({
    where: { id: user.id },
    select: { passwordHash: true, passwordAlgo: true },
  });
  // verifyPassword spends the dummy hash on a missing password too, so an empty field costs the
  // same quarter second a wrong one does and cannot be told apart by timing.
  const reauthenticated = await verifyPassword(
    currentPassword ?? "",
    row?.passwordHash,
    row?.passwordAlgo,
  );
  if (!reauthenticated) return { error: "currentPasswordIncorrect" };

  const { hash, algo } = await hashPassword(password);
  // Read outside the transaction: it is a request header, and the transaction below should hold a
  // connection for writes only.
  const current = (await cookies()).get(SESSION_COOKIE)?.value;

  // One transaction, because the three writes are one statement about the account: this password
  // is the password now. Run separately, a failure after the first leaves the new password stored
  // with the old password's sessions still live, or with an emailed link still able to overrule it,
  // and the action reports whichever half it managed.
  const changed = await prisma.$transaction(async (tx) => {
    const { count } = await tx.appUser.updateMany({
      where: { id: user.id },
      data: { passwordHash: hash, passwordAlgo: algo },
    });
    // Read, because updateMany calls a write that matched nothing a success. Telling someone their
    // password changed when nothing was stored is worse than any error: they would walk away
    // believing in a secret that exists nowhere.
    if (count === 0) return false;

    // A password change has to end the sessions someone else opened with the old password, which
    // is most of the reason to change one. The current session is the exception: signing the user
    // out of the tab they just typed the new password into reads as a failure, and it is the one
    // session that is certainly theirs.
    //
    // The count is deliberately not read: zero means this was the only device, which is the
    // ordinary case and not a failure. The delete is scoped by userId, so its blast radius is one
    // user either way.
    await tx.userSession.deleteMany({
      where: {
        userId: user.id,
        ...(current ? { NOT: { tokenHash: hashToken(current) } } : {}),
      },
    });

    // And any reset link still outstanding, for the same reason the sessions go.
    //
    // The likely story is someone who asked for a link, remembered the password before it arrived,
    // signed in and changed it here. That mail is still a working key to the account for the rest
    // of the hour, and it OVERRULES the password they just chose. Nothing about changing a password
    // from inside the app suggests an email sitting in an inbox can still undo it.
    await tx.passwordResetToken.updateMany({
      where: { userId: user.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });

    return true;
  });

  if (!changed) return { error: "generic" };
  return {};
}

export async function signOutAction(): Promise<void> {
  const jar = await cookies();
  // In EVERY provider, not only local, and the ordinary case is that this finds nothing: shadow
  // and supabase never issue one of our cookies, so the read is undefined and destroySession
  // returns immediately.
  //
  // The case it is here for is the one that survives a rollback. A user who signed in during a
  // local window holds this cookie for thirty days. Flip AUTH_PROVIDER back to `supabase`, let
  // them sign out, and the old code cleared GoTrue's cookie and left ours untouched, along with
  // its row: flip forward to `local` again inside the TTL and that sign-out is undone, silently.
  // A sign-out has to mean the same thing in every mode or it does not mean anything.
  //
  // Read before the delete: the row is keyed by the digest of this value, and the cookie is the
  // only place the value exists. destroySession treats an absent token and an unknown one alike,
  // so a visitor with no cookie is not an error.
  await destroySession(jar.get(SESSION_COOKIE)?.value);
  // Deleted even when there was no row to destroy. A cookie whose session is already gone still
  // has to leave the browser, or the user watches the app forget them and then remember them.
  jar.delete(SESSION_COOKIE);

  if (authProvider() === "local") return;

  // Shadow mode reaches here too: it never issues a local session, and GoTrue holds the cookie
  // that decides who is signed in.
  const supabase = await createClient();
  await supabase.auth.signOut();
}
