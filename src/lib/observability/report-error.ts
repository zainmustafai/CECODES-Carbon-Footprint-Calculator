// The one place an unexpected failure is reported.
//
// Before this, four call sites each did their own console.error with their own argument order,
// which in a container means four differently-shaped lines that no log drain can filter and no
// alert can match. For a tool whose worst failure is a silently wrong number, "it is in the logs
// somewhere" is not an observability posture.
//
// This is deliberately not a Sentry integration. It is the seam one would attach to: a single
// function, called from every boundary, whose body is the only thing that has to change. Adding
// @sentry/nextjs needs a DSN, an auth token and a source-map upload step in the image build, and
// none of that belongs in a change that can be verified here. Until then, one structured line per
// failure is what a `docker compose logs` grep and a log drain can both work with.

/**
 * Shapes that must never reach a log line, and what replaces them.
 *
 * This is not defence in depth against a careless caller. It is defence against the one thing no
 * caller controls: Prisma renders the ARGUMENTS of a failing call into its error message, and the
 * credential migration put `data.passwordHash` into the arguments of half a dozen writes that are
 * reported through here. mirrorLocalHash is designed to log its failures; the reset transaction
 * says a throw is the wanted behaviour; the rehash write inside signInLocally is not wrapped at
 * all. Each of those, on a schema mismatch or a constraint violation, hands this function a live
 * bcrypt hash, which is a password an attacker can grind offline at leisure.
 *
 * prisma/backfill-auth-credentials.ts reasoned this through and built its own redact() for exactly
 * this failure. It was the only file that had one. The rule belongs where every boundary already
 * calls, which is here.
 *
 * The connection string goes for the same reason: DATABASE_URL carries the database password and
 * appears verbatim in a driver's connection errors. The session and reset tokens are matched by
 * their query-string spelling, which is how a reset link ends up inside a URL in a stack trace.
 */
const SECRET_SHAPES: ReadonlyArray<[RegExp, string]> = [
  // $2a$/$2b$/$2y$, two cost digits, then 53 characters of salt and digest.
  [/\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}/g, "[hash redacted]"],
  [/postgres(?:ql)?:\/\/\S+/gi, "[connection string redacted]"],
  [/([?&]token=)[^&\s"']+/gi, "$1[token redacted]"],
];

/**
 * Applied to the finished line rather than to each field, so nothing can be smuggled past it by
 * being nested inside a context object: whatever JSON.stringify produced is what gets scanned.
 */
function redact(line: string): string {
  return SECRET_SHAPES.reduce((out, [shape, replacement]) => out.replace(shape, replacement), line);
}

type ErrorReport = {
  /** Where it happened, in words: "app error boundary", "reports/export". */
  where: string;
  error: unknown;
  /** Anything that identifies the request. Never a password, a token, or a whole entity. */
  context?: Record<string, unknown>;
};

/** The JSON line a report becomes. Exported so it can be tested without capturing console. */
export function formatErrorReport({ where, error, context }: ErrorReport): string {
  const base = {
    level: "error",
    at: new Date().toISOString(),
    where,
    name: error instanceof Error ? error.name : typeof error,
    message: error instanceof Error ? error.message : String(error),
    // Next hides the server stack from the browser and hands the client a digest instead. It is
    // the only way to line a user's report up with the server log entry that explains it.
    digest:
      typeof error === "object" && error !== null && "digest" in error
        ? String((error as { digest?: unknown }).digest)
        : undefined,
  };

  try {
    // Context first, so the fields above always win. A caller reporting a failure is already
    // having a bad day; a context key called `message` or `where` must not quietly replace the
    // two fields an operator reads first.
    return redact(JSON.stringify({ ...context, ...base }));
  } catch {
    // A context value that cannot be serialized (a cycle, a BigInt) must not cost us the report.
    // The caller's context is the only part that can fail, so it is the only part dropped: `base`
    // is built here from strings and is always serializable.
    return redact(JSON.stringify({ ...base, context: "[unserializable]" }));
  }
}

/**
 * Reports an unexpected failure. Safe to call from a Client Component, a Server Component, a
 * Server Action or a route handler, and safe to call in a `finally`: it never throws.
 */
export function reportError(report: ErrorReport): void {
  try {
    console.error(formatErrorReport(report));
  } catch {
    // Reporting must never be the thing that takes the process down.
  }
}
