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

  // The whole list of things that may stop this process, in one assertion, because the list is the
  // design and not an implementation detail. A rule in this schema costs every route on the site,
  // /api/health/live included, so it has to be a rule about being able to SERVE at all. Anything
  // that only one feature reads is reported instead. If a second variable is ever added here, this
  // is the test that has to be argued with first.
  it("has DATABASE_URL as its only fatal rule", () => {
    expect(boot({ DATABASE_URL: "" })).toThrow(/DATABASE_URL/);
    expect(
      boot({
        SITE_URL: "huella.cecodes.org",
        MAIL_TRANSPORT: "sendgrid",
        RESEND_API_KEY: "re_LiveKey\nwrapped",
        MAIL_FROM: "CECODES",
        SMTP_PORT: "not-a-number",
        SMTP_USER: "relay-user",
      }),
    ).not.toThrow();
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

  // SITE_URL used to be fatal here, and it is the same mistake the mail rules were: a rule that
  // belongs to one feature, enforced with the one consequence that costs every feature. It is
  // worse than the mail case in one respect, because the value that trips it is the one an
  // operator is most likely to type. DOMAIN is a bare hostname, so SITE_URL gets copied from it as
  // a bare hostname, validateRuntimeEnv threw, instrumentation.ts exited, and the site answered
  // 500 everywhere while edge middleware kept serving. A password-reset link pointing at the wrong
  // hostname is a bad day; a site that will not serve its dashboard is an outage.
  //
  // The rule itself is not relaxed. It moved to validateMailConfig, asserted at the bottom of this
  // file, where it is named at boot and costs nothing else.
  describe("SITE_URL", () => {
    it("accepts an absolute http(s) origin, development ports included", () => {
      expect(boot({ SITE_URL: "https://huella.example.org" })).not.toThrow();
      expect(boot({ SITE_URL: "http://localhost:3000" })).not.toThrow();
    });

    // The exact value that would have taken production down: a hostname with no scheme, which is
    // what DOMAIN holds and what an operator setting SITE_URL for the first time copies.
    it("boots on a bare hostname copied from DOMAIN", () => {
      expect(boot({ SITE_URL: "huella.cecodes.org" })).not.toThrow();
    });

    it("boots on a scheme no browser would follow to a reset page", () => {
      expect(boot({ SITE_URL: "ftp://huella.example.org" })).not.toThrow();
      expect(boot({ SITE_URL: "javascript:alert(1)" })).not.toThrow();
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

  // Mail simply off is not a misconfiguration, it is what a trial run looks like. Nothing that is
  // only required BY a transport may be reported when no transport was selected, or the boot log
  // of a deployment that never wanted mail fills with demands it has no reason to meet. The SMTP
  // pair is the case worth naming, because it is a cross-field rule and those are the ones that
  // forget to check whether they apply at all.
  it("reports nothing when no transport is selected", () => {
    expect(validateMailConfig({})).toEqual([]);
    expect(validateMailConfig({ RESEND_API_KEY: "re_live_key" })).toEqual([]);
    expect(validateMailConfig({ SMTP_USER: "relay-user" })).toEqual([]);
    expect(validateMailConfig({ SMTP_PASSWORD: "relay-pass" })).toEqual([]);
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

  // The newline above is the one that took the site down, but it is the least interesting of the
  // three, because a wrapped line is at least VISIBLE in a .env file if you look hard. These are
  // the ones that survive a careful operator: a non-breaking space and a smart quote ride along
  // with a paste out of a browser or a chat window and render exactly like the characters they
  // are not, and an interior plain space looks like nothing at all. Each one makes the key
  // unusable as an HTTP header value, so Resend would reject every send, and without this rule the
  // deployment would look configured, write token rows, and lose the mail silently.
  it("names RESEND_API_KEY for an interior non-breaking space, smart quote or plain space", () => {
    // Written as escapes on purpose. The whole point of the first two is that they are invisible
    // in a .env file, and a literal one pasted in here would be just as invisible in this test: a
    // later edit could turn it into an ordinary space and the assertion would still pass while
    // asserting something else entirely.
    const NBSP = " ";
    const SMART_QUOTE = "’";
    for (const key of [`re_Live${NBSP}Key`, `re_Live${SMART_QUOTE}Key`, "re_Live Key"]) {
      const source = {
        MAIL_TRANSPORT: "resend",
        RESEND_API_KEY: key,
        MAIL_FROM: "CECODES <no-reply@example.org>",
      };
      const issues = validateMailConfig(source);
      expect(issues).toHaveLength(1);
      expect(issues[0]).toContain("RESEND_API_KEY");
      expect(mailConfigured(source)).toBe(false);
    }
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

  /**
   * SITE_URL is reported here rather than being fatal at boot, and it is reported HERE rather than
   * by a reporter of its own because the only thing that ever reads it is the mail path: both
   * callers of siteOrigin() are the two Server Actions that build an emailed link. A deployment
   * with mail off cannot be harmed by a wrong SITE_URL, which is another way of saying it is a
   * mail variable.
   */
  describe("SITE_URL", () => {
    // Named, because the failure it causes is otherwise silent in the worst way: resolveSiteOrigin
    // discards what it cannot parse and falls through to DOMAIN and then VERCEL_URL, so the
    // override an operator set ON PURPOSE is ignored and the link goes out pointing somewhere
    // else. Nobody discovers that from the app; they discover it from a user forwarding the mail.
    it("names SITE_URL for a bare hostname copied from DOMAIN", () => {
      const issues = validateMailConfig({ SITE_URL: "huella.cecodes.org" });
      expect(issues).toHaveLength(1);
      expect(issues[0]).toContain("SITE_URL");
    });

    it("names SITE_URL for a scheme no browser would follow to a reset page", () => {
      expect(validateMailConfig({ SITE_URL: "ftp://huella.example.org" }).join("\n")).toContain("SITE_URL");
      expect(validateMailConfig({ SITE_URL: "javascript:alert(1)" }).join("\n")).toContain("SITE_URL");
    });

    // The same hygiene rule the rest of this reporter follows. SITE_URL is not a credential, but
    // these lines are assembled by shared code that also prints RESEND_API_KEY's issues, and a
    // reporter that quotes one value will eventually quote the other.
    it("names SITE_URL without printing the value", () => {
      const issues = validateMailConfig({ SITE_URL: "s3cr3t-looking-value" });
      expect(issues.join("\n")).toContain("SITE_URL");
      expect(issues.join("\n")).not.toContain("s3cr3t-looking-value");
    });

    it("reports nothing for an absolute http(s) origin, or for no SITE_URL at all", () => {
      expect(validateMailConfig({ SITE_URL: "https://huella.cecodes.org" })).toEqual([]);
      expect(validateMailConfig({ SITE_URL: "http://localhost:3000" })).toEqual([]);
      expect(validateMailConfig({ SITE_URL: " https://huella.cecodes.org " })).toEqual([]);
      expect(validateMailConfig({ SITE_URL: "" })).toEqual([]);
      expect(validateMailConfig({})).toEqual([]);
    });

    /**
     * And the decision this whole change turns on: reported, but NOT disabling.
     *
     * mailConfigured() answers false on every other line this reporter can produce, because every
     * other line means a send that cannot succeed: a key Resend rejects, a From with no address, a
     * relay that will answer 530. A wrong SITE_URL means none of that. The mail leaves, arrives,
     * and carries a link that works, built from DOMAIN or VERCEL_URL instead, which on Vercel is
     * the canonical hostname anyway.
     *
     * The cost of getting this wrong is asymmetric and that is what settles it. Answering false
     * would mean nobody on that deployment can reset a password at all, which is the recovery path
     * for people who are ALREADY locked out, taken away over a hostname preference. Answering true
     * costs, at worst, a link on the wrong one of the deployment's own hostnames.
     *
     * The case where there is no fallback is already handled, and not here: requestPasswordReset
     * and createUser both read siteOrigin() and refuse when it is empty, so an unusable SITE_URL
     * with no DOMAIN and no VERCEL_URL still writes no token row and mails nothing. This function
     * does not need to duplicate that guard, and duplicating it would break the case where the
     * fallback exists.
     */
    it("does not disable mail: an unusable SITE_URL is reported, and mail still sends", () => {
      const source = {
        MAIL_TRANSPORT: "resend",
        RESEND_API_KEY: "re_1AbCdEf_GhIjKlMnOpQrStUvWxYz",
        MAIL_FROM: "CECODES <no-reply@example.org>",
        SITE_URL: "huella.cecodes.org",
      };
      expect(validateMailConfig(source).join("\n")).toContain("SITE_URL");
      expect(mailConfigured(source)).toBe(true);
    });
  });
});
