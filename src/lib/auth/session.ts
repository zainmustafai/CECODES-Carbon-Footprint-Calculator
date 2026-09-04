import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";

// Opaque server-side sessions, stored in user_sessions. The cookie holds 32 random bytes and
// nothing else.
//
// Deliberately NOT a JWT. Role, companyId and active live in app_users and are re-read on every
// request, which is what makes a deactivation take effect immediately (see the AppUser.active
// comment in prisma/schema.prisma). Signing those facts into a self-contained token would turn
// "immediate" into "takes effect at token expiry", and buying that back needs a revocation list,
// which is a session table with extra steps. A row per session also gives sign-out, sign-out
// everywhere and an incident review something real to act on.
//
// The cost is one indexed lookup per request. That is a single primary-key-shaped read on a
// unique column, next to the several queries every page already makes.

/** The cookie the browser carries. Named once, here, so nothing has to guess the string. */
export const SESSION_COOKIE = "cecodes_session";

/**
 * How long a session lasts.
 *
 * Thirty days because this is an annual reporting tool: a user opens it during a reporting
 * period, leaves it for weeks, and comes back. A short expiry would mean a password prompt on
 * almost every visit without buying much, since deactivation does not wait for expiry here.
 */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** 256 bits of entropy. Guessing is not an attack against a token this size. */
const TOKEN_BYTES = 32;

/**
 * How stale lastUsedAt is allowed to get before a read pays for a write.
 *
 * The tradeoff: at one hour, a busy session writes once an hour instead of once per request,
 * so this column costs nothing on a page that fires several requests. What it buys back is
 * precision, and lastUsedAt is only ever read by a human asking "when was this session last
 * seen". An hour is close enough for that, and nothing authorizes on it.
 */
const LAST_USED_PRECISION_MS = 60 * 60 * 1000;

/**
 * A user agent string is whatever the client sent, and it is kept for support, never for
 * authorization. Truncated so a hostile caller cannot write unbounded text into the row.
 */
const USER_AGENT_MAX = 512;

/**
 * The longest an IPv6 address gets in text form, and so the longest value worth keeping.
 *
 * The address is client-influenced in exactly the same way the user agent is: it starts life as
 * an x-forwarded-for header. It is bounded here rather than on the trust that every caller
 * sanitized it first, because the callers are a sign-in action, a reset flow and whatever comes
 * next, and only one of them has to forward the raw header once.
 *
 * Dropped rather than truncated: a cut-down address is a different address, and this column is
 * read by a human reconstructing an incident, who is better served by nothing than by a
 * plausible wrong answer.
 */
const IP_MAX = 45;

export type SessionUser = { id: string; email: string };

/**
 * The only form of a session token that is ever written down.
 *
 * A leaked database backup must not hand over live sessions, so the table stores the digest and
 * the plaintext exists only in the cookie. SHA-256 without a salt on purpose: the input is 256
 * random bits, so there is no dictionary to defend against, and the lookup has to be a single
 * indexed equality on tokenHash.
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function newToken(): string {
  const bytes = new Uint8Array(TOKEN_BYTES);
  crypto.getRandomValues(bytes);
  // base64url so the value survives a cookie header untouched: no padding, no + or /.
  return Buffer.from(bytes).toString("base64url");
}

/**
 * Issues a session and returns the plaintext token to the caller ONCE.
 *
 * The caller sets it as a cookie and forgets it; nothing can recover it afterwards, because
 * only the digest was stored.
 */
export async function createSession(
  userId: string,
  meta?: { ip?: string | null; userAgent?: string | null },
): Promise<{ token: string; expiresAt: Date }> {
  const token = newToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await prisma.userSession.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt,
      ip: meta?.ip && meta.ip.length <= IP_MAX ? meta.ip : null,
      userAgent: meta?.userAgent?.slice(0, USER_AGENT_MAX) ?? null,
    },
  });

  return { token, expiresAt };
}

/**
 * Resolves a cookie value to the user it belongs to, or null.
 *
 * It does NOT check appUser.active, and must not start: that decision belongs to
 * company-scope.ts, which is the one place the app decides who may act. Answering "is this
 * session real" here and "may this user act" there keeps each with a single responsibility, and
 * keeps this function from becoming a second, quieter authorization boundary that someone later
 * has to remember to keep in step.
 */
export async function readSession(token: string | null | undefined): Promise<SessionUser | null> {
  if (!token) return null;

  const row = await prisma.userSession.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      id: true,
      expiresAt: true,
      lastUsedAt: true,
      user: { select: { id: true, email: true } },
    },
  });
  if (!row) return null;

  const now = Date.now();

  if (row.expiresAt.getTime() <= now) {
    // Swept when presented rather than by a background job, because the only sessions worth the
    // write are the ones someone still holds a cookie for. Everything else ages out harmlessly
    // behind the expiresAt index and can be cleaned in bulk whenever it is worth doing.
    await prisma.userSession.deleteMany({ where: { id: row.id } });
    return null;
  }

  if (now - row.lastUsedAt.getTime() > LAST_USED_PRECISION_MS) {
    // deleteMany/updateMany rather than update: a sign-out on another tab can remove this row
    // between the read above and this write, and update would throw P2025 over bookkeeping. The
    // count is deliberately not checked here; zero means the session just ended, which is not an
    // error on this path (unlike a tenant-scoped write, where zero hides a cross-tenant attempt).
    await prisma.userSession.updateMany({
      where: { id: row.id },
      data: { lastUsedAt: new Date(now) },
    });
  }

  return { id: row.user.id, email: row.user.email };
}

/** Sign out. Unknown or already-deleted tokens are not an error: the end state is the same. */
export async function destroySession(token: string | null | undefined): Promise<void> {
  if (!token) return;
  await prisma.userSession.deleteMany({ where: { tokenHash: hashToken(token) } });
}

/**
 * Sign out everywhere. Returns the number of sessions ended, so a caller can tell the user and so
 * a test can prove the blast radius is one user.
 *
 * NOT for use after a password change or reset, despite being the obvious candidate. Those three
 * sites (auth-actions reset and self-service change, user-actions password reset) end sessions
 * with tx.userSession.deleteMany INSIDE the transaction that writes the new hash, because this
 * helper holds the app's own Prisma client and cannot join one. Calling it there would let the
 * hash land while the sweep failed, leaving the account holding a new password with every old
 * session still live, which is the precise outcome the sweep exists to prevent.
 *
 * It has no production caller today for that reason. It is kept for the case it genuinely fits,
 * a deliberate "sign out my other devices" action, where there is no other write to be atomic
 * with.
 */
export async function destroyAllSessionsForUser(userId: string): Promise<number> {
  const { count } = await prisma.userSession.deleteMany({ where: { userId } });
  return count;
}

/**
 * How the cookie is written.
 *
 * `secure` only in production, because local development runs over plain http and a secure
 * cookie there is simply never sent, which looks exactly like a broken sign-in.
 *
 * `sameSite: "lax"` rather than "strict": nothing in this app is a cross-site POST, so strict
 * costs nothing there, but it also withholds the cookie on a top-level navigation that arrived
 * from another site, which is precisely how a password reset link lands from an email client.
 * The user would arrive signed out and blame the link.
 */
export function sessionCookieOptions(expiresAt: Date): {
  httpOnly: boolean;
  secure: boolean;
  sameSite: "lax";
  path: string;
  expires: Date;
} {
  return {
    // No client script has any reason to read this, and script cannot be allowed to exfiltrate it.
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  };
}
