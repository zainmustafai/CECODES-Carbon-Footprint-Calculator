"use server";

import { cookies, headers } from "next/headers";
import { after } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { mailConfigured } from "@/lib/env";
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
} from "../schemas/auth-server-schemas";

// Every door into the application, backed by one credential store: app_users, in this database.
// The shape every action shares: validate first, throttle second, and only then let a password be
// checked at all.

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
    // being asked at all. Every attempt spends a quarter of a second of this server's CPU on
    // bcrypt, so an unmetered endpoint would be a denial of service lever as well as a guessing
    // one.
    const throttleKeys = signInThrottleKeys(parsed.data.email, ip);
    if (await isSignInThrottled(throttleKeys)) return { error: "tooManyAttempts" };

    return await signInWithCredentials(parsed.data, throttleKeys, ip);
  } catch (error) {
    // No address, ever. "who tried to sign in" is the fact these logs must not carry, for the
    // reason src/lib/mail/send.ts gives, and it is the one field a caller controls here.
    reportError({ where: "auth/sign-in", error });
    return { error: "generic" };
  }
}

/** The only sign-in: app_users holds the credential, and nothing else is ever asked. */
async function signInWithCredentials(
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
    // No session is issued, and the attempt is not counted, because the password was right and
    // counting it would let a deactivated user lock out the address they may later be reactivated
    // on.
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

/**
 * Self-serve registration, closed by policy rather than by deleting the route.
 *
 * FEATURE_SELF_ONBOARDING documents why (a self-registered user has no signal for which company
 * they belong to) and it stays false regardless of this function: even flipped true, reopening
 * self-serve onboarding needs THIS function to mint the app_users row and the password hash itself,
 * the way admin createUser already does, which is a change to this body and not a flag flip. So the
 * function refuses unconditionally, on purpose, and the exported name and the register screen stay
 * in place for whenever that change is made.
 */
export async function signUpAction(input: {
  email: string;
  password: string;
}): Promise<{ error?: string; needsConfirmation?: boolean }> {
  void input;
  return { error: "registrationDisabled" };
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

  const normalized = normalizeEmail(parsed.data);

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
      // every one of those. requestPasswordResetAction refuses to mint a link for a deactivated
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
 * The signed-in password change.
 *
 * Recovery arrives as ?token= and never as a session (route-gate.ts explains the split), so a
 * session on this action is always somebody who already knows the password: asking for it costs
 * one field and closes the "thirty seconds at an unlocked laptop" takeover below.
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
  // This is where the 8-character minimum is actually enforced.
  const parsed = updatePasswordInput.safeParse(input);
  if (!parsed.success) return { error: "invalidInput" };

  return changeSignedInPassword(parsed.data);
}

async function changeSignedInPassword({
  password,
  currentPassword,
}: {
  password: string;
  currentPassword?: string;
}): Promise<{ error?: string }> {
  // Re-established here rather than trusted to whatever rendered the form: this is a public POST
  // endpoint that changes a credential, and a page guard protects rendering only. getUser() is the
  // single answer to "who is asking".
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
  // Read before the delete: the row is keyed by the digest of this value, and the cookie is the
  // only place the value exists. destroySession treats an absent token and an unknown one alike,
  // so a visitor with no cookie is not an error.
  await destroySession(jar.get(SESSION_COOKIE)?.value);
  // Deleted even when there was no row to destroy. A cookie whose session is already gone still
  // has to leave the browser, or the user watches the app forget them and then remember them.
  jar.delete(SESSION_COOKIE);
}
