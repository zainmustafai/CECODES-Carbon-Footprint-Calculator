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
 * Two schemas, and the split between them is the important part of this file.
 *
 * runtimeSchema holds what the app cannot serve a single request without, and failing it is
 * fatal: instrumentation.ts stops the process. The mail rules used to live there too, and that
 * cost a full outage. A deploy went out with a RESEND_API_KEY that had wrapped when it was
 * pasted, validateRuntimeEnv() threw, the boot hook exited, and every route answered 500,
 * /api/health/live included. One auxiliary feature's typo took down a site that was otherwise
 * perfectly able to serve every page it has.
 *
 * So mail lives in mailSchema, checked by validateMailConfig(), which REPORTS rather than throws.
 * Not one rule was dropped in the move: what changes is the consequence. A mail slip now costs
 * the mail feature (mailConfigured() answers false, so the reset is refused up front and no token
 * row is written) and a named, unmissable line in the boot log, instead of the whole site.
 *
 * SITE_URL followed it, for the same argument and after nearly the same accident. It was the last
 * fatal rule that was not about being able to serve, and the value that tripped it is the one an
 * operator types first: a bare hostname copied from DOMAIN. Its shape is now siteUrlSchema, also
 * reported by validateMailConfig, but with one difference from the mail rules that is spelled out
 * at mailConfigured(): it does not turn mail off, because a wrong SITE_URL still delivers a
 * working link from a fallback origin, and refusing every password reset over it would cost more
 * than the fault does.
 *
 * What is left in runtimeSchema is DATABASE_URL, and that is the whole intended list. The test for
 * this file pins it as a list, so adding a second fatal rule means arguing with a test that asks
 * whether the app can SERVE without the variable, which is the only question that justifies one.
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
 * non-breaking space picked up from a browser) would otherwise boot clean, mailConfigured() would
 * answer true, the reset action would write a live token row and tell the user to check their
 * inbox, and only then would the send be dropped with a single console.warn: silent production
 * mail loss, which is the exact thing this file's header says it exists to prevent. So the rule is
 * enforced here too, in mailSchema below, where it is checked at boot while an operator is still
 * watching AND read by mailConfigured() so the reset refuses instead of lying. Both enforcers read
 * the same constant rather than each carrying a copy that can drift.
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

  // Carried as a plain optional string, exactly like the mail variables below and for the same
  // reason. Its shape rule lives in siteUrlSchema and is REPORTED, not fatal.
  //
  // It used to be enforced here, and that was the mail mistake made a second time, with a worse
  // trigger. The value that trips the rule is the one an operator is most likely to type: DOMAIN
  // holds a bare hostname, so SITE_URL gets set to a bare hostname, and a first deploy that sets
  // it would refuse to start. Nothing about a wrong SITE_URL stops this app from serving a single
  // page. resolveSiteOrigin() discards what it cannot parse and falls through to DOMAIN and then
  // VERCEL_URL, so the honest consequence is a mailed link on the wrong hostname, or on Vercel the
  // right one by accident. That is a reason to shout at boot. It is not a reason to answer 500 on
  // /api/health/live.
  SITE_URL: optionalVar(z.string()),

  // The mail variables are carried here as plain optional strings and nothing more. Every rule
  // about their CONTENT lives in mailSchema below, because a rule in this schema is fatal and
  // mail is not: the app serves every page, people sign in, and one feature is off. Keeping the
  // fields (rather than dropping them) preserves the one behaviour that is shared, the trim in
  // optionalVar, so a value with surrounding whitespace still gets one answer everywhere.
  RESEND_API_KEY: optionalVar(z.string()),
  MAIL_FROM: optionalVar(z.string()),
  MAIL_TRANSPORT: optionalVar(z.string()),
  SMTP_HOST: optionalVar(z.string()),
  SMTP_PORT: optionalVar(z.string()),
  SMTP_USER: optionalVar(z.string()),
  SMTP_PASSWORD: optionalVar(z.string()),
});

/**
 * Every rule about mail, and the only place any of them is written.
 *
 * Separate from runtimeSchema for one reason, paid for in a production outage: failing this is
 * not a reason to refuse to serve. See the header of this file. What failing it DOES cost is the
 * feature itself, because mailConfigured() reads this schema, so a deployment that would drop or
 * bounce its mail refuses the password reset up front instead of writing a token row and telling
 * a user to watch an inbox nothing will arrive in.
 *
 * The rules are the ones that used to sit in runtimeSchema, moved verbatim. Every one of them
 * catches a slip that is otherwise invisible until a user reports a mail that never came.
 */
const mailSchema = z
  .object({
    // The placeholder check guards against the same slip as .env.example's other commented-out
    // examples: uncommenting the two RESEND lines and pasting only one of them is a routine slip,
    // and it is invisible: mailConfigured() would say yes, the token row would be written, the
    // user would be told to check an inbox, and Resend would reject the key.
    //
    // The header-safety rule is the second half of the same argument, and it is the half that
    // survives a careful operator: a key can be entirely correct and still unusable because the
    // line wrapped, or because a smart quote or a non-breaking space rode along with the paste.
    // Neither is visible in a .env file. See HEADER_SAFE_VALUE above for why the check cannot wait
    // for the send.
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
    // which z.email() rejects. The one mistake worth catching is a From with no address in it at
    // all, which the provider refuses at send time, long after the token row was written.
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
 * SITE_URL's shape, kept apart from both schemas above on purpose, because it belongs to neither.
 *
 * Not in runtimeSchema, because failing it stops the process, and a wrong SITE_URL is not a reason
 * the app cannot serve. See the field's own comment there.
 *
 * Not folded into mailSchema either, even though validateMailConfig reports it, because
 * mailConfigured() reads mailSchema and must NOT read this one. A separate object is what keeps
 * those two answers separable; see mailConfigured() for the argument.
 *
 * Reported by validateMailConfig rather than by a reporter of its own for a reason worth stating,
 * since a reporter of its own was the obvious alternative. SITE_URL has exactly one reader:
 * siteOrigin() in src/lib/site-url.ts, whose only two callers are the password reset action and
 * the admin's create-user welcome mail. It is read to build an emailed link and for nothing else,
 * so a deployment with mail off cannot be harmed by a wrong value, which is another way of saying
 * it is a mail variable. The practical half of the argument matters too: the boot hook already
 * calls validateMailConfig and already prints its lines by name, so this rule reaches an operator
 * through machinery that exists, instead of through a second reporter that src/instrumentation.ts
 * would have to be taught to call and could silently forget to.
 */
const siteUrlSchema = z.object({
  SITE_URL: optionalVar(
    z.url({ protocol: /^https?$/, message: "SITE_URL must be an absolute http(s) URL" }),
  ),
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
 * container logs and Vercel runtime logs alike, both of which are routinely pasted into chat
 * windows and issue trackers.
 *
 * The name is taken from the issue path rather than trusted to the message, because a message
 * written for one failure does not cover the others. `z.string().min(1, "DATABASE_URL is
 * required")` attaches that sentence to the length check only, so an absent variable, the whole
 * reason this file exists, fell through to zod's default: an empty .env produced three identical
 * lines reading "Invalid input: expected string, received undefined" and named nothing at all.
 * Only zod's own defaults are ever printed unprefixed, and none of them quote the value.
 */
function issueLines(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const name = typeof issue.path[0] === "string" ? issue.path[0] : "";
    // Cross-field rules carry no path, and a message that already names its variable reads worse
    // for having it twice.
    if (!name || issue.message.includes(name)) return issue.message;
    return `${name}: ${issue.message}`;
  });
}

/** Every issue `schema` finds in `source`, as reportable lines. Empty when it parses. */
function issuesFor(schema: z.ZodType, source: EnvSource): string[] {
  const parsed = schema.safeParse(source);
  return parsed.success ? [] : issueLines(parsed.error);
}

function formatIssues(error: z.ZodError): string {
  return issueLines(error)
    .map((line) => `  - ${line}`)
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

/**
 * Every mail problem in `source`, one line each, naming the variable and never quoting its value.
 * An empty array means the mail configuration is coherent, which includes "no mail at all".
 *
 * "Mail problem" includes SITE_URL, which is the origin every emailed link is built from and is
 * read for nothing else. See siteUrlSchema for why it is reported here and why it is kept in a
 * schema of its own rather than merged into mailSchema.
 *
 * Returns instead of throwing, and that is the whole point of it. The caller at boot
 * (src/instrumentation.ts) logs these and carries on, because a wrong RESEND_API_KEY is a reason
 * for password reset to stop working, not for /api/health/live to answer 500. The caller that
 * matters for users is mailConfigured() below, which refuses the feature outright on any line
 * this returns.
 *
 * The values are never included: RESEND_API_KEY and SMTP_PASSWORD are live credentials, and these
 * lines land in a Vercel runtime log or a container log, both of which get pasted into issue
 * trackers and chat windows.
 */
export function validateMailConfig(source: EnvSource = process.env): string[] {
  return [...issuesFor(mailSchema, source), ...issuesFor(siteUrlSchema, source)];
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
 *
 * Any mail issue at all answers false, and this line is what carries the mail rules now that they
 * no longer stop the process. Before the split, a key that had wrapped on paste could not reach
 * here because boot had already refused it; with boot only logging, presence alone would let
 * requestPasswordResetAction write a live token row and tell the user to check their inbox, while
 * the send is dropped later with one console.warn. That is exactly the silent loss the
 * header-safety rule was written to prevent, so the rule has to be read here, not just reported.
 *
 * SITE_URL is the deliberate exception, and it reads mailSchema rather than validateMailConfig to
 * make that exception exact rather than implied. Every OTHER line that reporter can produce
 * describes a send that cannot succeed: a key Resend rejects, a From with no address in it, a
 * relay that will answer "530 Authentication required". A wrong SITE_URL describes none of those.
 * The mail leaves, arrives, and carries a working link, built from DOMAIN or VERCEL_URL instead,
 * which on Vercel is the canonical hostname anyway.
 *
 * The asymmetry is what settles it. Answering false here would mean nobody on that deployment can
 * reset a password at all, and password reset is the recovery path for people who are ALREADY
 * locked out, so the cost of the strict reading is an auth outage over a hostname preference.
 * The cost of the lenient reading is, at worst, a link on the wrong one of the deployment's own
 * hostnames, announced by name in the boot log. That is the same trade the whole file is built on:
 * one feature's configuration must not be allowed to cost more than that feature.
 *
 * The genuinely broken case is already handled, and not here. When SITE_URL is unusable AND there
 * is no DOMAIN and no VERCEL_URL, siteOrigin() answers "", and both callers that build a link
 * (requestPasswordReset and the admin's createUser) check that separately and refuse before any
 * token row is written. Repeating that guard here would be redundant where it is right and wrong
 * everywhere else, because it would also refuse the deployments where the fallback works.
 */
export function mailConfigured(source: EnvSource = process.env): boolean {
  if (issuesFor(mailSchema, source).length > 0) return false;

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
