// True when a write failed because the email is already registered.
//
// Previously this matched GoTrue error codes and five English message substrings, which was the
// only way to ask an HTTP API. With the credential in our own table it is a unique constraint, and
// that constraint can reach the caller in more than one shape:
//
//   - P2002 with meta.target naming the field ("email") or, for a compound index, an array that
//     includes it. This is Prisma's usual translation, and the one every other Prisma-facing
//     uniqueness check in this codebase already expects.
//   - P2002 with meta.target naming the INDEX instead ("app_users_email_key"), which is what
//     Prisma falls back to when it cannot resolve the underlying index back to a field name.
//   - The raw Postgres code (23505), with no `meta` at all, which is what reaches the caller when
//     a failure does not go through Prisma's own translation layer. isUniqueViolation in
//     features/admin/actions/user-actions.ts already matches this code for the same reason. What
//     names the constraint here is `.constraint` (set by the pg driver) or, failing that, the
//     sentence in `.detail` ("Key (email)=(...) already exists.").
//
// email is the only column in this schema that both participates in a unique index and has a name
// containing "email" (emailConfirmedAt is not unique), so a plain case-insensitive substring test
// cannot cross-match some OTHER unique column that merely mentions it.
//
// Deliberately typed `unknown`: the caller has a caught error, not a Prisma error instance, and
// narrowing here rather than at each call site keeps the check in one place.
export function isEmailInUse(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as {
    code?: unknown;
    meta?: { target?: unknown };
    constraint?: unknown;
    detail?: unknown;
  };
  if (candidate.code !== "P2002" && candidate.code !== "23505") return false;

  return (
    mentionsEmail(candidate.meta?.target) ||
    mentionsEmail(candidate.constraint) ||
    mentionsEmail(candidate.detail)
  );
}

function mentionsEmail(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(mentionsEmail);
  return typeof value === "string" && value.toLowerCase().includes("email");
}
