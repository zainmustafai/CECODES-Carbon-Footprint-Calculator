// True when a write failed because the email is already registered.
//
// Previously this matched GoTrue error codes and five English message substrings, which was the
// only way to ask an HTTP API. With the credential in our own table it is a unique constraint, and
// Prisma reports that as P2002 with the offending field in meta.target.
//
// Deliberately typed `unknown`: the caller has a caught error, not a Prisma error instance, and
// narrowing here rather than at each call site keeps the check in one place.
export function isEmailInUse(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; meta?: { target?: unknown } };
  if (candidate.code !== "P2002") return false;

  const target = candidate.meta?.target;
  // meta.target is string[] for a compound index and string for a single column, depending on the
  // connector. Both shapes have to answer the same way.
  if (Array.isArray(target)) return target.includes("email");
  return target === "email";
}
