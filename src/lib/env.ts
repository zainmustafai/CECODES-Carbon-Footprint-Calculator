import { z } from "zod";

/**
 * The environment contract, in one place.
 *
 * Before this existed, a missing variable surfaced in one of two ways, neither good: a 500 on the
 * first database query (DATABASE_URL), or a boot that succeeded and then failed a request the
 * moment it needed something optional, in whatever shape that feature's own code chose to fail in.
 *
 * On Vercel that was survivable: the variables are set once in a dashboard and rarely move. In a
 * container they come from a .env file that a human edits per server, so a typo is routine and
 * has to be caught at boot rather than at first request.
 *
 * Deliberately NOT validated as a URL: DATABASE_URL. Prisma and pg accept forms zod's url()
 * rejects, and a false rejection at boot would be worse than the late failure it replaces.
 */

/**
 * Optional, with "" read the same as absent and surrounding whitespace stripped.
 *
 * A .env file cannot comment one line out per server, so an operator turning an optional variable
 * off empties it instead of deleting the line, and docker compose passes that through as "".
 * Without this, `SITE_URL=` would fail the URL check and stop the container, which is the
 * opposite of what "optional" promises.
 *
 * The trim matters just as much, because every reader below this schema already trims:
 * mailConfigured() and sendMail() both call .trim() on the raw variable. Handing the untrimmed
 * string to the checks here would let a value with trailing whitespace pass one check and fail
 * the other. One string has to get one answer.
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

/**
 * Visible ASCII, which is every character an API key has and the only range an HTTP header value
 * can carry without argument.
 *
 * Exported because two places have to agree on it. src/lib/mail/transports/resend.ts refuses to
 * send with a key that fails this test, for a reason written out there: fetch quotes the offending
 * value back in its error, and a wrapped key would then print in full in the one log an operator is
 * most likely to ship somewhere else. But refusing at send time is far too late for the OTHER
 * failure. A key with a stray non-visible character (wrapped on paste, a smart quote, a
 * non-breaking space picked up from a browser) boots clean, mailConfigured() answers true, the
 * reset action writes a live token row and tells the user to check their inbox, and only then is
 * the send dropped with a single console.warn: silent production mail loss, which is the exact
 * thing this file's header says it exists to prevent. So the rule is enforced here too, at boot,
 * while an operator is still watching, and both enforcers read the same constant rather than each
 * carrying a copy that can drift.
 */
export const HEADER_SAFE_VALUE = /^[\x21-\x7e]+$/;

const MAIL_TRANSPORTS = ["smtp", "resend", "none"] as const;

/**
 * Where outbound mail goes. Unset means "none", so a deployment that has never configured mail
 * runs normally and refuses password resets up front rather than accepting one it cannot deliver.
 */
export type MailTransport = (typeof MAIL_TRANSPORTS)[number];

const mailTransportSchema = z.enum(MAIL_TRANSPORTS, {
  message: "MAIL_TRANSPORT must be one of: smtp, resend, none",
});

/** Variables the app cannot serve a single authenticated request without. */
const runtimeSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

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
  // The placeholder check guards against the same slip as .env.example's other commented-out
  // examples: uncommenting the two RESEND lines and pasting only one of them is a routine
  // slip, and it is invisible: mailConfigured() would say yes, the token row would be written,
  // the user would be told to check an inbox, and Resend would reject the key.
  //
  // The header-safety rule is the second half of the same argument, and it is the half that
  // survives a careful operator: a key can be entirely correct and still unusable because the line
  // wrapped, or because a smart quote or a non-breaking space rode along with the paste. Neither is
  // visible in a .env file. See HEADER_SAFE_VALUE above for why the check cannot wait for the send.
  RESEND_API_KEY: optionalVar(
    z
      .string()
      .refine((v) => !v.includes("<resend-api-key>"), {
        message: "RESEND_API_KEY still holds the .env.example placeholder",
      })
      .refine((v) => HEADER_SAFE_VALUE.test(v), {
        message:
          "RESEND_API_KEY is not usable as an HTTP header value: it must be visible ASCII, with no spaces, line breaks or smart quotes",
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
  MAIL_TRANSPORT: optionalVar(mailTransportSchema),
  SMTP_HOST: optionalVar(z.string()),
  SMTP_PORT: optionalVar(z.coerce.number().int().positive().max(65535)),
  SMTP_USER: optionalVar(z.string()),
  SMTP_PASSWORD: optionalVar(z.string()),
})
  // Half a mail configuration is always a mistake and never a state anyone chose, and nothing
  // downstream can raise it: sendMail() warns only once a user has already asked for a reset.
  // This is the one line that says so at boot.
  .superRefine((env, ctx) => {
    const transport = env.MAIL_TRANSPORT ?? "none";
    if (transport === "none") return;

    const required =
      transport === "resend" ? (["RESEND_API_KEY", "MAIL_FROM"] as const) : (["SMTP_HOST", "MAIL_FROM"] as const);
    for (const name of required) {
      if (!env[name]) {
        ctx.addIssue({ code: "custom", message: `${name} is required when MAIL_TRANSPORT=${transport}` });
      }
    }

    if (transport !== "smtp") return;

    // The other pair, and the one that fails without ever naming itself. smtp.ts sends
    // `auth: user && password ? { user, pass: password } : undefined`, so one half without the
    // other is not a partial login: it is NO auth at all. nodemailer connects anonymously, a real
    // relay answers "530 Authentication required", and the only thing an operator sees is a mail
    // that did not arrive. Both halves absent stays legal, because Mailpit accepts anything and
    // needs neither, which is exactly why the pairing has to be checked rather than the presence.
    if (Boolean(env.SMTP_USER) !== Boolean(env.SMTP_PASSWORD)) {
      const missing = env.SMTP_USER ? "SMTP_PASSWORD" : "SMTP_USER";
      ctx.addIssue({
        code: "custom",
        message: `${missing} is required when the other half of the SMTP credential pair is set`,
      });
    }
  });

/**
 * Additionally required by the init job: migrations, and creating the first admin.
 */
function initSchemaFor() {
  return runtimeSchema.extend({
    ADMIN_EMAIL: z.email("ADMIN_EMAIL must be an email address"),
    // Optional, because init generates one when it is unset (and prints it once). A value that IS
    // provided must still be usable, so the length rule stays on the present case only.
    ADMIN_PASSWORD: optionalVar(z.string().min(12, "ADMIN_PASSWORD must be at least 12 characters")),
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
  const parsed = initSchemaFor().safeParse(source);
  if (!parsed.success) {
    throw new Error(
      `Invalid environment. Database initialization cannot run:\n${formatIssues(parsed.error)}\n\n` +
        `See .env.example for the full list.`,
    );
  }
  return parsed.data;
}

/** The transport in force. Unset, or unreadable, answers "none". */
export function mailTransport(source: EnvSource = process.env): MailTransport {
  const parsed = mailTransportSchema.safeParse(source.MAIL_TRANSPORT?.trim());
  return parsed.success ? parsed.data : "none";
}

/**
 * Whether mail can be sent at all. Callers check it before writing a token row, so a deployment
 * with no mail refuses the reset up front rather than telling a user to watch an inbox nothing
 * will arrive in.
 */
export function mailConfigured(source: EnvSource = process.env): boolean {
  const from = Boolean(source.MAIL_FROM?.trim());
  switch (mailTransport(source)) {
    case "smtp":
      return from && Boolean(source.SMTP_HOST?.trim());
    case "resend":
      return from && Boolean(source.RESEND_API_KEY?.trim());
    default:
      return false;
  }
}

/** Variable names the init job reports as present, so a log shows what was configured. */
export const INIT_ENV_KEYS = [
  "DATABASE_URL",
  "DIRECT_URL",
  "SITE_URL",
  "MAIL_TRANSPORT",
  "ADMIN_EMAIL",
  "ADMIN_PASSWORD",
] as const;
