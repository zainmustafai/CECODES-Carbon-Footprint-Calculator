import { describe, expect, it } from "vitest";
import {
  mailConfigured,
  mailTransport,
  validateInitEnv,
  validateMailConfig,
  validateRuntimeEnv,
} from "../env";

// This contract is the app's only chance to refuse a bad deployment: src/instrumentation.ts calls
// validateRuntimeEnv() once and exits non-zero if it throws. Everything it lets through boots and
// serves traffic, so the cases worth pinning are the ones where a wrong value would otherwise be
// discovered by a user rather than by the operator who typed it.
//
// Which makes what belongs in it a load-bearing question, and one this file gets to state. Only
// what the app cannot SERVE without may throw here, because throwing here means the whole site is
// down: an exit at boot returns 500 for every route, /api/health/live included. Mail is checked by
// validateMailConfig() instead, which reports the same rules without stopping anything.

/** A deployment that should boot: the one genuinely required variable, nothing else. */
const VALID: Record<string, string | undefined> = {
  DATABASE_URL: "postgresql://user:pw@db.example.org:6543/postgres",
};

function boot(overrides: Record<string, string | undefined> = {}) {
  return () => validateRuntimeEnv({ ...VALID, ...overrides });
}

describe("validateRuntimeEnv", () => {
  it("boots on the one required variable alone", () => {
    expect(boot()).not.toThrow();
  });

  it("boots with no Supabase variables at all", () => {
    expect(() =>
      validateRuntimeEnv({
        DATABASE_URL: "postgresql://u:p@db:5432/cecodes",
        SITE_URL: "http://localhost:3000",
        MAIL_TRANSPORT: "resend",
        RESEND_API_KEY: "re_live_key",
        MAIL_FROM: "CECODES <no-reply@localhost>",
      }),
    ).not.toThrow();
  });

  // An empty .env is the commonest first run, and it used to fail with three identical lines
  // reading "Invalid input: expected string, received undefined". A boot message that names
  // nothing leaves the operator exactly where they started.
  it("names the variable at fault when it is absent", () => {
    let message = "";
    try {
      validateRuntimeEnv({});
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain("DATABASE_URL");
    // Every reported line carries a variable name, so none of them is anonymous.
    const reported = message.split("\n").filter((line) => line.startsWith("  - "));
    expect(reported).toHaveLength(1);
    expect(reported[0]).toMatch(/DATABASE_URL/);
  });

  // These messages go straight to a container log, and container logs get pasted into issue
  // trackers and chat windows. A DATABASE_URL carries a database password.
  it("reports the name of a bad variable and never its value", () => {
    let message = "";
    try {
      validateRuntimeEnv({ ...VALID, SITE_URL: "s3cr3t-looking-value" });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain("SITE_URL");
    expect(message).not.toContain("s3cr3t-looking-value");
  });

  describe("optional variables", () => {
    // An operator turning something off empties the line instead of deleting it, and compose
    // hands that through as "". Treating it as a value would stop the container.
    it("reads an empty or blank value the same as an absent one", () => {
      expect(boot({ SITE_URL: "", MAIL_FROM: "", RESEND_API_KEY: "" })).not.toThrow();
      expect(boot({ SITE_URL: "   " })).not.toThrow();
    });

    // The readers of these variables all call .trim() on the raw string. If the schema did not,
    // a value with surrounding whitespace could pass one check and fail another.
    it("strips surrounding whitespace instead of failing on it", () => {
      expect(boot({ SITE_URL: " https://huella.example.org " })).not.toThrow();
    });
  });

  describe("SITE_URL", () => {
    it("accepts an absolute http(s) origin, development ports included", () => {
      expect(boot({ SITE_URL: "https://huella.example.org" })).not.toThrow();
      expect(boot({ SITE_URL: "http://localhost:3000" })).not.toThrow();
    });

    // The wrong answer an operator actually gives: DOMAIN is a bare hostname, so it gets copied
    // here as one. resolveSiteOrigin() cannot parse it, silently ignores the override and mails
    // links built from a fallback, or from nothing at all.
    it("refuses a bare hostname copied from DOMAIN", () => {
      expect(boot({ SITE_URL: "huella.example.org" })).toThrow(/SITE_URL/);
    });

    it("refuses a scheme no browser would follow to a reset page", () => {
      expect(boot({ SITE_URL: "ftp://huella.example.org" })).toThrow(/SITE_URL/);
      expect(boot({ SITE_URL: "javascript:alert(1)" })).toThrow(/SITE_URL/);
    });
  });

  // The mail rules used to be asserted here, as reasons validateRuntimeEnv() throws, and that is
  // precisely what took the site down: a wrapped RESEND_API_KEY exited the process at boot and
  // every route answered 500. Every one of those rules still exists and is still asserted, in
  // "validateMailConfig" at the bottom of this file. What is pinned here is the other half of the
  // trade, that none of them can stop the app any more.
  describe("the mail transport", () => {
    it("boots with no transport selected, and with either transport fully configured", () => {
      expect(boot()).not.toThrow();
      expect(
        boot({
          MAIL_TRANSPORT: "resend",
          RESEND_API_KEY: "re_live_key",
          MAIL_FROM: "CECODES <no-reply@example.org>",
        }),
      ).not.toThrow();
      expect(
        boot({ MAIL_TRANSPORT: "smtp", SMTP_HOST: "mailpit", MAIL_FROM: "CECODES <no-reply@example.org>" }),
      ).not.toThrow();
    });

    // Selecting a transport is what turns its pair into a requirement, and that requirement is now
    // validateMailConfig's to enforce. Booting is unaffected either way.
    it("boots with mail variables set but no transport selected", () => {
      expect(boot({ RESEND_API_KEY: "re_live_key" })).not.toThrow();
    });
  });
});

describe("validateInitEnv", () => {
  // ADMIN_PASSWORD is optional: prisma/seed.ts generates one and prints it once when it is
  // unset. An unset variable must pass here, or that path can never run.
  it("boots without ADMIN_PASSWORD, so init can generate one", () => {
    expect(() =>
      validateInitEnv({
        DATABASE_URL: "postgresql://u:p@db:5432/cecodes",
        ADMIN_EMAIL: "admin@cecodes.local",
      }),
    ).not.toThrow();
  });

  it("boots on DATABASE_URL, ADMIN_EMAIL and ADMIN_PASSWORD alone, no Supabase variables", () => {
    expect(() =>
      validateInitEnv({
        DATABASE_URL: "postgresql://u:p@db:5432/cecodes",
        ADMIN_EMAIL: "admin@cecodes.local",
        ADMIN_PASSWORD: "a-long-enough-password",
      }),
    ).not.toThrow();
  });

  it("still refuses an ADMIN_PASSWORD that was set but is too short", () => {
    expect(() =>
      validateInitEnv({
        DATABASE_URL: "postgresql://u:p@db:5432/cecodes",
        ADMIN_EMAIL: "admin@cecodes.local",
        ADMIN_PASSWORD: "short",
      }),
    ).toThrow(/ADMIN_PASSWORD/);
  });
});

describe("mailTransport", () => {
  it("reads the selected transport", () => {
    expect(mailTransport({ MAIL_TRANSPORT: "resend" })).toBe("resend");
    expect(mailTransport({ MAIL_TRANSPORT: "smtp" })).toBe("smtp");
  });

  it("answers none when unset or unreadable", () => {
    expect(mailTransport({})).toBe("none");
    expect(mailTransport({ MAIL_TRANSPORT: "" })).toBe("none");
    expect(mailTransport({ MAIL_TRANSPORT: "sendgrid" })).toBe("none");
  });
});

describe("mailConfigured", () => {
  it("is false with no transport selected, even if the resend pair is set", () => {
    expect(mailConfigured({ RESEND_API_KEY: "re_live_key", MAIL_FROM: "a@example.org" })).toBe(false);
    expect(mailConfigured({})).toBe(false);
  });

  it("is true only when resend is selected and both halves carry a value", () => {
    expect(
      mailConfigured({ MAIL_TRANSPORT: "resend", RESEND_API_KEY: "re_live_key", MAIL_FROM: "a@example.org" }),
    ).toBe(true);
    expect(mailConfigured({ MAIL_TRANSPORT: "resend", RESEND_API_KEY: "re_live_key" })).toBe(false);
    expect(mailConfigured({ MAIL_TRANSPORT: "resend", MAIL_FROM: "a@example.org" })).toBe(false);
  });

  it("is true only when smtp is selected and both halves carry a value", () => {
    expect(
      mailConfigured({ MAIL_TRANSPORT: "smtp", SMTP_HOST: "mailpit", MAIL_FROM: "a@example.org" }),
    ).toBe(true);
    expect(mailConfigured({ MAIL_TRANSPORT: "smtp", SMTP_HOST: "mailpit" })).toBe(false);
  });

  it("does not count a blank value as configuration", () => {
    expect(
      mailConfigured({ MAIL_TRANSPORT: "resend", RESEND_API_KEY: "   ", MAIL_FROM: "a@example.org" }),
    ).toBe(false);
  });
});

/**
 * Mail configuration is reported, never fatal.
 *
 * A deploy went out with a RESEND_API_KEY that had wrapped when it was pasted. The mail rules
 * lived in the fatal runtime schema, so validateRuntimeEnv() threw, instrumentation.ts exited the
 * process, and every route answered 500 including /api/health/live, which does nothing but return
 * OK. Edge middleware kept working, which is what pinned it: only the node runtime validates.
 *
 * A mail typo taking the whole site down is a far worse failure than the silent mail loss the
 * rule was written to prevent. The line is now drawn at "can the app serve": DATABASE_URL is
 * fatal because nothing works without it, mail is not, because the app serves, people sign in,
 * and exactly one feature is off.
 *
 * So none of the rules is relaxed. They move: validateMailConfig() reports them, mailConfigured()
 * answers false on any of them so no password_reset_tokens row is ever written for a deployment
 * that cannot deliver, and boot logs the names and carries on.
 */

/** A key that wrapped mid-value, which the outer trim in optionalVar cannot help with. */
const WRAPPED_KEY = "re_LiveKeyThatMustNotBeLogged\nwrapped";

describe("mail misconfiguration never stops the app", () => {
  it("boots with a RESEND_API_KEY that wrapped on paste", () => {
    expect(
      boot({ MAIL_TRANSPORT: "resend", RESEND_API_KEY: WRAPPED_KEY, MAIL_FROM: "CECODES <a@example.org>" }),
    ).not.toThrow();
  });

  it("boots with a transport selected and its other half missing", () => {
    expect(boot({ MAIL_TRANSPORT: "resend", RESEND_API_KEY: "re_live_key" })).not.toThrow();
    expect(boot({ MAIL_TRANSPORT: "smtp", SMTP_HOST: "relay.example.org" })).not.toThrow();
  });

  it("boots on every other mail slip: placeholder, bad transport, bad port, half a credential pair", () => {
    expect(boot({ RESEND_API_KEY: "<resend-api-key>", MAIL_FROM: "CECODES <a@example.org>" })).not.toThrow();
    expect(boot({ MAIL_TRANSPORT: "sendgrid" })).not.toThrow();
    expect(boot({ SMTP_PORT: "not-a-number" })).not.toThrow();
    expect(
      boot({
        MAIL_TRANSPORT: "smtp",
        SMTP_HOST: "relay.example.org",
        MAIL_FROM: "CECODES <a@example.org>",
        SMTP_USER: "relay-user",
      }),
    ).not.toThrow();
    expect(
      boot({ MAIL_TRANSPORT: "resend", RESEND_API_KEY: "re_live_key", MAIL_FROM: "CECODES" }),
    ).not.toThrow();
  });

  // Same principle one layer down: a container must not refuse to run its migrations and create
  // its first admin because the mail variables are wrong. Nothing the init job does sends mail.
  it("lets the init job run with mail misconfigured", () => {
    expect(() =>
      validateInitEnv({
        DATABASE_URL: "postgresql://u:p@db:5432/cecodes",
        ADMIN_EMAIL: "admin@cecodes.local",
        MAIL_TRANSPORT: "resend",
        RESEND_API_KEY: WRAPPED_KEY,
      }),
    ).not.toThrow();
  });
});

describe("validateMailConfig", () => {
  it("reports nothing for a fully configured resend deployment, and mailConfigured agrees", () => {
    const source = {
      MAIL_TRANSPORT: "resend",
      RESEND_API_KEY: "re_1AbCdEf_GhIjKlMnOpQrStUvWxYz",
      MAIL_FROM: "CECODES <no-reply@example.org>",
    };
    expect(validateMailConfig(source)).toEqual([]);
    expect(mailConfigured(source)).toBe(true);
  });

  it("reports nothing for a fully configured smtp deployment, and mailConfigured agrees", () => {
    const source = {
      MAIL_TRANSPORT: "smtp",
      SMTP_HOST: "relay.example.org",
      SMTP_PORT: "587",
      SMTP_USER: "relay-user",
      SMTP_PASSWORD: "relay-pass",
      MAIL_FROM: "CECODES <no-reply@example.org>",
    };
    expect(validateMailConfig(source)).toEqual([]);
    expect(mailConfigured(source)).toBe(true);
  });

  // Mail simply off is not a misconfiguration, it is what a trial run looks like.
  it("reports nothing when no transport is selected", () => {
    expect(validateMailConfig({})).toEqual([]);
    expect(validateMailConfig({ RESEND_API_KEY: "re_live_key" })).toEqual([]);
    expect(mailConfigured({})).toBe(false);
  });

  // The exact deploy that caused the outage. The app must serve, the issue must be reported by
  // name, and the reset must refuse up front rather than writing a token nothing will deliver.
  it("names RESEND_API_KEY for a key that is not a usable header value, and mailConfigured is false", () => {
    const source = {
      MAIL_TRANSPORT: "resend",
      RESEND_API_KEY: WRAPPED_KEY,
      MAIL_FROM: "CECODES <no-reply@example.org>",
    };
    const issues = validateMailConfig(source);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain("RESEND_API_KEY");
    expect(mailConfigured(source)).toBe(false);
  });

  // These lines go to a Vercel runtime log and a container log alike, and both get pasted into
  // issue trackers. The variable is named; the live key never travels with it.
  it("never prints the key it rejects", () => {
    const issues = validateMailConfig({
      MAIL_TRANSPORT: "resend",
      RESEND_API_KEY: WRAPPED_KEY,
      MAIL_FROM: "CECODES <no-reply@example.org>",
    });
    expect(issues.join("\n")).not.toContain("re_LiveKeyThatMustNotBeLogged");
  });

  it("names the missing half of a resend configuration", () => {
    expect(validateMailConfig({ MAIL_TRANSPORT: "resend", RESEND_API_KEY: "re_live_key" }).join("\n")).toContain(
      "MAIL_FROM",
    );
    expect(
      validateMailConfig({ MAIL_TRANSPORT: "resend", MAIL_FROM: "CECODES <a@example.org>" }).join("\n"),
    ).toContain("RESEND_API_KEY");
    expect(mailConfigured({ MAIL_TRANSPORT: "resend", RESEND_API_KEY: "re_live_key" })).toBe(false);
  });

  it("names the missing half of an smtp configuration", () => {
    expect(validateMailConfig({ MAIL_TRANSPORT: "smtp", SMTP_HOST: "relay.example.org" }).join("\n")).toContain(
      "MAIL_FROM",
    );
    expect(
      validateMailConfig({ MAIL_TRANSPORT: "smtp", MAIL_FROM: "CECODES <a@example.org>" }).join("\n"),
    ).toContain("SMTP_HOST");
  });

  // The pair that fails without ever naming itself: smtp.ts sends no auth at all when one half is
  // missing, so a real relay answers "530 Authentication required" and nothing names the variable.
  it("still catches an SMTP_USER with no SMTP_PASSWORD, and the reverse", () => {
    function smtp(overrides: Record<string, string | undefined>) {
      return validateMailConfig({
        MAIL_TRANSPORT: "smtp",
        SMTP_HOST: "relay.example.org",
        MAIL_FROM: "CECODES <no-reply@example.org>",
        ...overrides,
      });
    }
    expect(smtp({ SMTP_USER: "relay-user" }).join("\n")).toContain("SMTP_PASSWORD");
    expect(smtp({ SMTP_PASSWORD: "relay-pass" }).join("\n")).toContain("SMTP_USER");
    // A blanked half reads the same as an absent one, the way every other reader treats it.
    expect(smtp({ SMTP_USER: "relay-user", SMTP_PASSWORD: "   " }).join("\n")).toContain("SMTP_PASSWORD");
    // Neither half is the Mailpit case and stays legal.
    expect(smtp({})).toEqual([]);
    expect(
      mailConfigured({
        MAIL_TRANSPORT: "smtp",
        SMTP_HOST: "relay.example.org",
        MAIL_FROM: "CECODES <no-reply@example.org>",
        SMTP_USER: "relay-user",
      }),
    ).toBe(false);
  });

  it("still catches the .env.example placeholder", () => {
    const source = {
      MAIL_TRANSPORT: "resend",
      RESEND_API_KEY: "<resend-api-key>",
      MAIL_FROM: "CECODES <a@example.org>",
    };
    expect(validateMailConfig(source).join("\n")).toContain("RESEND_API_KEY");
    expect(mailConfigured(source)).toBe(false);
  });

  it("still catches a MAIL_FROM with no address in it", () => {
    const source = { MAIL_TRANSPORT: "resend", RESEND_API_KEY: "re_live_key", MAIL_FROM: "CECODES" };
    expect(validateMailConfig(source).join("\n")).toContain("MAIL_FROM");
    expect(mailConfigured(source)).toBe(false);
  });

  it("still catches a transport name nothing can dispatch to", () => {
    expect(validateMailConfig({ MAIL_TRANSPORT: "sendgrid" }).join("\n")).toContain("MAIL_TRANSPORT");
  });

  it("still catches an SMTP_PORT that is not a port", () => {
    const source = {
      MAIL_TRANSPORT: "smtp",
      SMTP_HOST: "relay.example.org",
      MAIL_FROM: "CECODES <a@example.org>",
      SMTP_PORT: "not-a-number",
    };
    expect(validateMailConfig(source).join("\n")).toContain("SMTP_PORT");
    expect(mailConfigured(source)).toBe(false);
  });
});
