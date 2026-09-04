import { z } from "zod";

/**
 * The environment contract, in one place.
 *
 * Before this existed, a missing variable surfaced in one of three ways, none of them good:
 * a 500 on the first database query (DATABASE_URL), a crash inside supabase-js
 * (NEXT_PUBLIC_SUPABASE_URL, which src/lib/supabase/server.ts asserts with `!`), or - worst -
 * an app that booted and served protected routes with the auth gate silently switched off
 * (src/lib/supabase/middleware.ts used to return early when the Supabase env was absent).
 *
 * On Vercel that was survivable: the variables are set once in a dashboard and rarely move. In a
 * container they come from a .env file that a human edits per server, so a typo is routine and
 * has to be caught at boot rather than at first request.
 *
 * Deliberately NOT validated as a URL: DATABASE_URL. Prisma and pg accept forms zod's url()
 * rejects, and a false rejection at boot would be worse than the late failure it replaces.
 */

// The list is the definition and the type below is read off it. Declaring the union separately
// only constrains the list one way: a fourth mode added to the union alone would compile, and the
// type would then promise a value the schema always rejects and authProvider() can never return.
const AUTH_PROVIDERS = ["supabase", "shadow", "local"] as const;

/**
 * Where a password is checked, while the app moves off Supabase Auth onto hashes kept in its own
 * database. Three modes, because a credential store cannot be swapped in one step:
 *
 *   supabase  Today's behaviour. Supabase GoTrue is the only authority on a password; the local
 *             hash column is written but never read.
 *   shadow    Supabase still decides the sign-in, but the local hash is verified alongside it and
 *             the two verdicts are logged when they disagree. Nothing acts on the local result,
 *             so a hash that came across the backfill wrong costs a log line rather than locking
 *             someone out. This is how the backfill earns trust before anything depends on it.
 *   local     Self-hosted only. Supabase is never asked, and a row with no hash cannot sign in.
 *
 * Unset means "supabase", so a deployment that has never heard of this migration keeps working.
 */
export type AuthProvider = (typeof AUTH_PROVIDERS)[number];

const authProviderSchema = z.enum(AUTH_PROVIDERS, {
  message: "AUTH_PROVIDER must be one of: supabase, shadow, local",
});

/**
 * Optional, with "" read the same as absent and surrounding whitespace stripped.
 *
 * A .env file cannot comment one line out per server, so an operator turning an optional variable
 * off empties it instead of deleting the line, and docker compose passes that through as "".
 * Without this, `SITE_URL=` would fail the URL check and stop the container, which is the
 * opposite of what "optional" promises.
 *
 * The trim matters just as much, because every reader below this schema already trims:
 * authProvider(), mailConfigured() and sendMail() all call .trim() on the raw variable. Handing
 * the untrimmed string to the checks here would let `AUTH_PROVIDER="local "` refuse the boot with
 * a message that lists "local" as allowed, while the reader that decides sign-ins would have read
 * it as "local". One string has to get one answer.
 */
function optionalVar<T extends z.ZodType>(schema: T) {
  return z.preprocess((value) => {
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    return trimmed === "" ? undefined : trimmed;
  }, schema.optional());
}

/**
 * Where the functions below read variables from. Defaults to process.env everywhere.
 *
 * Deliberately wider than NodeJS.ProcessEnv: Next augments that type with a REQUIRED NODE_ENV, so
 * a caller assembling an environment by hand, a test or a script checking a candidate .env, would
 * have to supply a variable none of this file reads. process.env still satisfies it.
 */
type EnvSource = Record<string, string | undefined>;

/** Variables the app cannot serve a single authenticated request without. */
const runtimeSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  // Still required, deliberately. The cutover has not happened: every sign-in today is decided by
  // Supabase, so an app that booted without these would have no way to authenticate anyone.
  // Making them optional is the last commit of this migration, not an early one.
  NEXT_PUBLIC_SUPABASE_URL: z
    .string()
    .min(1, "NEXT_PUBLIC_SUPABASE_URL is required")
    .refine((v) => !v.includes("<project-ref>"), {
      message: "NEXT_PUBLIC_SUPABASE_URL still holds the .env.example placeholder",
    }),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z
    .string()
    .min(1, "NEXT_PUBLIC_SUPABASE_ANON_KEY is required"),

  AUTH_PROVIDER: optionalVar(authProviderSchema),

  // Checked here for the first time. resolveSiteOrigin() in src/lib/site-url.ts discards anything
  // it cannot parse and falls through to DOMAIN and then VERCEL_URL, so the commonest wrong answer
  // (a bare hostname copied from DOMAIN) failed silently in the worst way: the override an
  // operator set on purpose was ignored, and the reset mail went out pointing at whatever the
  // fallbacks named, or nowhere at all when there were none. Naming the variable at boot is
  // cheaper than a user discovering it in their inbox.
  SITE_URL: optionalVar(
    z.url({ protocol: /^https?$/, message: "SITE_URL must be an absolute http(s) URL" }),
  ),

  // Password-reset mail, and nothing else, needs these two. Absent, the app runs and every other
  // feature works; the reset flow refuses up front (mailConfigured below) rather than accepting a
  // request it cannot deliver on.
  //
  // The placeholder check has the same job here as it does on NEXT_PUBLIC_SUPABASE_URL above.
  // Uncommenting the two RESEND lines in .env.example and pasting only one of them is a routine
  // slip, and it is invisible: mailConfigured() would say yes, the token row would be written,
  // the user would be told to check an inbox, and Resend would reject the key.
  RESEND_API_KEY: optionalVar(
    z.string().refine((v) => !v.includes("<resend-api-key>"), {
      message: "RESEND_API_KEY still holds the .env.example placeholder",
    }),
  ),
  // Not validated as an email address: a From header is normally "CECODES <no-reply@example.org>",
  // which z.email() rejects. The one mistake worth catching at boot is a From with no address in
  // it at all, which the provider refuses at send time, long after the token row was written.
  MAIL_FROM: optionalVar(
    z.string().refine((v) => v.includes("@"), {
      message: "MAIL_FROM must contain an email address",
    }),
  ),
})
  // Both or neither, enforced where it can still be seen. Half a mail configuration is always a
  // mistake and never a state anyone chose, but nothing downstream can raise it: sendMail() warns
  // to the log only once a user has already asked for a reset, and mailConfigured() simply answers
  // no. So a key with a misspelt MAIL_FORM beside it boots clean, every page works, and password
  // reset is dead until somebody reads the logs. This is the one line that says so at boot.
  .superRefine((env, ctx) => {
    if (Boolean(env.RESEND_API_KEY) === Boolean(env.MAIL_FROM)) return;
    const missing = env.RESEND_API_KEY ? "MAIL_FROM" : "RESEND_API_KEY";
    ctx.addIssue({
      code: "custom",
      message: `${missing} is required whenever the other half of the mail configuration is set`,
    });
  });

/**
 * Additionally required by the init job: migrations, and creating the first admin.
 *
 * SUPABASE_SERVICE_ROLE_KEY is demanded only while GoTrue is still the store the admin account has
 * to exist IN. prisma/seed.ts, which this job exists to run, already decides it exactly this way
 * ("On a self-hosted deployment the two Supabase variables are not merely unused, they are
 * legitimately absent"), and the two disagreed: the seed would not ask for the key, and the job
 * that runs the seed refused to start without it. A self-hosted .env with AUTH_PROVIDER=local and
 * no Supabase project got "[init] FAILED: Environment validation failed", so migrations never
 * applied and the app container never started, and the only way past it was to invent a key.
 *
 * Taken from the same source being validated rather than from process.env, so a caller checking a
 * candidate .env gets an answer about that file and not about the machine it is running on.
 */
function initSchemaFor(source: EnvSource) {
  const base = runtimeSchema.extend({
    ADMIN_EMAIL: z.email("ADMIN_EMAIL must be an email address"),
    ADMIN_PASSWORD: z.string().min(12, "ADMIN_PASSWORD must be at least 12 characters"),
  });

  if (authProvider(source) === "local") return base;

  return base.extend({
    SUPABASE_SERVICE_ROLE_KEY: z
      .string()
      .min(1, "SUPABASE_SERVICE_ROLE_KEY is required to create the admin account"),
  });
}

export type RuntimeEnv = z.infer<typeof runtimeSchema>;

/**
 * Reports the NAMES of variables that failed validation, never their values. These messages reach
 * container logs, which are routinely pasted into chat windows and issue trackers.
 *
 * The name is taken from the issue path rather than trusted to the message, because a message
 * written for one failure does not cover the others. `z.string().min(1, "DATABASE_URL is
 * required")` attaches that sentence to the length check only, so an absent variable, the whole
 * reason this file exists, fell through to zod's default: an empty .env produced three identical
 * lines reading "Invalid input: expected string, received undefined" and named nothing at all.
 * Only zod's own defaults are ever printed unprefixed, and none of them quote the value.
 */
function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const name = typeof issue.path[0] === "string" ? issue.path[0] : "";
      // Cross-field rules carry no path, and a message that already names its variable reads worse
      // for having it twice.
      if (!name || issue.message.includes(name)) return `  - ${issue.message}`;
      return `  - ${name}: ${issue.message}`;
    })
    .join("\n");
}

export function validateRuntimeEnv(source: EnvSource = process.env): RuntimeEnv {
  const parsed = runtimeSchema.safeParse(source);
  if (!parsed.success) {
    throw new Error(
      `Invalid environment. The application cannot start:\n${formatIssues(parsed.error)}\n\n` +
        `See .env.example for the full list.`,
    );
  }
  return parsed.data;
}

export function validateInitEnv(source: EnvSource = process.env) {
  const parsed = initSchemaFor(source).safeParse(source);
  if (!parsed.success) {
    throw new Error(
      `Invalid environment. Database initialization cannot run:\n${formatIssues(parsed.error)}\n\n` +
        `See .env.example for the full list.`,
    );
  }
  return parsed.data;
}

/**
 * The provider in force. Unset, or unreadable, answers "supabase".
 *
 * Falls back rather than throwing because this is read on the sign-in path, where one mistyped
 * variable must not become a 500 for every user. The fallback is not the real defence either:
 * validateRuntimeEnv already refused to boot on a value that is not one of the three, so in a
 * running app this only ever answers "the variable is unset", which is today's behaviour.
 */
export function authProvider(source: EnvSource = process.env): AuthProvider {
  const parsed = authProviderSchema.safeParse(source.AUTH_PROVIDER?.trim());
  return parsed.success ? parsed.data : "supabase";
}

/**
 * Whether password-reset mail can be sent at all.
 *
 * Both variables or neither: a key with no From address cannot address a message, and a From
 * address with no key cannot send one. Half a configuration cannot reach a deployed app, because
 * runtimeSchema above refuses to boot on it; this answers the remaining question, whether mail was
 * configured at all. Callers check it before writing a token row, so a deployment with no mail
 * refuses the reset up front rather than telling a user to watch an inbox nothing will arrive in.
 */
export function mailConfigured(source: EnvSource = process.env): boolean {
  return Boolean(source.RESEND_API_KEY?.trim() && source.MAIL_FROM?.trim());
}

/** Variable names the init job reports as present, so a log shows what was configured. */
export const INIT_ENV_KEYS = [
  "DATABASE_URL",
  "DIRECT_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "ADMIN_EMAIL",
  "ADMIN_PASSWORD",
] as const;
