import { prisma } from "@/lib/prisma";
import { hashToken } from "@/lib/auth/session";

// One place that mints a password reset token, for the reason session.ts already gives about
// sessions: two copies of the same security-relevant logic would drift, and a fix (a shorter TTL,
// a stronger token) would land in only one. requestPasswordResetAction and createUser both call
// this rather than each writing their own passwordResetToken row.
//
// Neither caller's guards live here. This function does not check whether the account exists, is
// active, or whether mail is even configured; it trusts the caller to have already decided a link
// should be issued (requestPasswordResetAction's user lookup, createUser's freshly inserted row).

/**
 * How long an emailed reset link is good for.
 *
 * An hour, because the two failures are asymmetric. Too short and a user who reads their mail
 * after lunch asks for a second link, and the support cost of that lands on CECODES. Too long and
 * a message sitting in a mailbox goes on being a working key to the account long after the person
 * has forgotten they asked. An hour covers "find the email, open it, type a password" with room to
 * spare and little else.
 */
export const RESET_TTL_MINUTES = 60;

/** 256 bits, for the reason session.ts gives: guessing is not an attack on a token this size. */
const RESET_TOKEN_BYTES = 32;

function newResetToken(): string {
  const bytes = new Uint8Array(RESET_TOKEN_BYTES);
  crypto.getRandomValues(bytes);
  // base64url so the value survives a query string untouched: no padding, no + or /.
  return Buffer.from(bytes).toString("base64url");
}

/**
 * Writes one single-use reset token for `userId` and returns the plaintext plus its lifetime.
 *
 * Only the digest is written, exactly as with a session: a leaked backup of this table must not
 * hand over working reset links. The plaintext exists in the returned value, for the caller to put
 * in a message, and nowhere else.
 */
export async function issuePasswordResetToken(
  userId: string,
): Promise<{ token: string; expiresInMinutes: number }> {
  const token = newResetToken();
  await prisma.passwordResetToken.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + RESET_TTL_MINUTES * 60 * 1000),
    },
  });
  return { token, expiresInMinutes: RESET_TTL_MINUTES };
}
