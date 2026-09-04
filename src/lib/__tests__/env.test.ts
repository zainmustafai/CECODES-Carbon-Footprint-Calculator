import { describe, expect, it } from "vitest";
import { mailConfigured, mailTransport, validateInitEnv, validateRuntimeEnv } from "../env";

// This contract is the app's only chance to refuse a bad deployment: src/instrumentation.ts calls
// validateRuntimeEnv() once and exits non-zero if it throws. Everything it lets through boots and
// serves traffic, so the cases worth pinning are the ones where a wrong value would otherwise be
// discovered by a user rather than by the operator who typed it.

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

  it("rejects the .env.example placeholder rather than booting with it", () => {
    expect(
      boot({ RESEND_API_KEY: "<resend-api-key>", MAIL_FROM: "CECODES <a@example.org>" }),
    ).toThrow(/RESEND_API_KEY/);
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

    // Selecting a transport is what turns its pair into a requirement. Setting the resend
    // variables with no MAIL_TRANSPORT leaves mail simply off (mailConfigured() answers false),
    // rather than half-configured: nobody chose resend, so there is nothing to refuse yet.
    it("boots with mail variables set but no transport selected", () => {
      expect(boot({ RESEND_API_KEY: "re_live_key" })).not.toThrow();
    });

    // Half a mail configuration is always a mistake once a transport is chosen, and it is
    // invisible everywhere else: the app boots, every page works, and password reset is quietly
    // dead until somebody reads a log line that only appears once a user has already asked for one.
    it("refuses half a resend configuration, naming the missing half", () => {
      expect(boot({ MAIL_TRANSPORT: "resend", RESEND_API_KEY: "re_live_key" })).toThrow(/MAIL_FROM/);
      expect(
        boot({ MAIL_TRANSPORT: "resend", MAIL_FROM: "CECODES <no-reply@example.org>" }),
      ).toThrow(/RESEND_API_KEY/);
    });

    it("refuses half an smtp configuration, naming the missing half", () => {
      expect(boot({ MAIL_TRANSPORT: "smtp", SMTP_HOST: "mailpit" })).toThrow(/MAIL_FROM/);
      expect(
        boot({ MAIL_TRANSPORT: "smtp", MAIL_FROM: "CECODES <no-reply@example.org>" }),
      ).toThrow(/SMTP_HOST/);
    });

    // SMTP credentials are the other pair, and they were not paired. smtp.ts writes
    // `auth: user && password ? {...} : undefined`, so one without the other is not a partial
    // login, it is NO auth at all: nodemailer connects anonymously and a real relay answers
    // "530 Authentication required" with nothing anywhere naming the variable that was left out.
    // Both halves are still optional together, because Mailpit accepts anything and needs neither.
    describe("the smtp credential pair", () => {
      function smtp(overrides: Record<string, string | undefined>) {
        return boot({
          MAIL_TRANSPORT: "smtp",
          SMTP_HOST: "relay.example.org",
          MAIL_FROM: "CECODES <no-reply@example.org>",
          ...overrides,
        });
      }

      it("boots with neither half, which is the Mailpit case", () => {
        expect(smtp({})).not.toThrow();
      });

      it("boots with both halves", () => {
        expect(smtp({ SMTP_USER: "relay-user", SMTP_PASSWORD: "relay-pass" })).not.toThrow();
      });

      it("refuses a user with no password, naming the password", () => {
        expect(smtp({ SMTP_USER: "relay-user" })).toThrow(/SMTP_PASSWORD/);
      });

      it("refuses a password with no user, naming the user", () => {
        expect(smtp({ SMTP_PASSWORD: "relay-pass" })).toThrow(/SMTP_USER/);
      });

      // The shape an operator actually produces: the line is emptied rather than deleted, and
      // compose hands that through as "". Every other reader treats blank as absent, so this one
      // has to as well, or "half a configuration" would depend on which of the two spellings of
      // "off" was used.
      it("reads a blanked half the same as an absent one", () => {
        expect(smtp({ SMTP_USER: "relay-user", SMTP_PASSWORD: "   " })).toThrow(/SMTP_PASSWORD/);
      });

      // Nobody chose smtp, so there is no half-configuration to refuse yet: the same rule the
      // resend pair already follows.
      it("says nothing about the pair when no transport is selected", () => {
        expect(boot({ SMTP_USER: "relay-user" })).not.toThrow();
      });
    });

    // resend.ts refuses to send with a key that is not a usable header value, and refusing there
    // is far too late: the app boots, mailConfigured() answers true, the reset action writes a
    // live token row and tells the user to check their inbox, and only then is the send dropped
    // with a single console.warn. That is the silent production mail loss this file's own header
    // says it exists to prevent, so the rule belongs at boot, where an operator is still watching.
    describe("RESEND_API_KEY header safety", () => {
      function withKey(key: string) {
        return boot({
          MAIL_TRANSPORT: "resend",
          RESEND_API_KEY: key,
          MAIL_FROM: "CECODES <no-reply@example.org>",
        });
      }

      it("boots on an ordinary key", () => {
        expect(withKey("re_1AbCdEf_GhIjKlMnOpQrStUvWxYz")).not.toThrow();
      });

      // A key that wrapped when it was pasted into a .env file. The outer trim in optionalVar
      // cannot help: the break is in the middle.
      it("refuses a key carrying a line break", () => {
        expect(withKey("re_1AbCdEf\n_GhIjKlMnOpQrStUvWxYz")).toThrow(/RESEND_API_KEY/);
      });

      // The two invisible characters a paste from a browser or a document actually introduces.
      it("refuses a key carrying a non-breaking space or a smart quote", () => {
        expect(withKey("re_1AbCdEf GhIjKlMnOpQrStUvWxYz")).toThrow(/RESEND_API_KEY/);
        expect(withKey("re_1AbCdEf’GhIjKlMnOpQrStUvWxYz")).toThrow(/RESEND_API_KEY/);
      });

      // Same rule as every other message this file produces: these go to a container log, and a
      // container log gets pasted into an issue tracker. A live API key must not travel with it.
      it("names the variable and never prints the key", () => {
        let message = "";
        try {
          validateRuntimeEnv({
            ...VALID,
            MAIL_TRANSPORT: "resend",
            RESEND_API_KEY: "re_LiveKeyThatMustNotBeLogged\nwrapped",
            MAIL_FROM: "CECODES <no-reply@example.org>",
          });
        } catch (error) {
          message = (error as Error).message;
        }
        expect(message).toContain("RESEND_API_KEY");
        expect(message).not.toContain("re_LiveKeyThatMustNotBeLogged");
      });
    });

    // A From header is normally "Name <address>", which is not an email address by itself, so the
    // only shape worth rejecting is one with no address in it at all.
    it("accepts a display-name From and rejects one with no address", () => {
      expect(
        boot({
          MAIL_TRANSPORT: "resend",
          RESEND_API_KEY: "re_live_key",
          MAIL_FROM: "CECODES <no-reply@example.org>",
        }),
      ).not.toThrow();
      expect(
        boot({ MAIL_TRANSPORT: "resend", RESEND_API_KEY: "re_live_key", MAIL_FROM: "CECODES" }),
      ).toThrow(/MAIL_FROM/);
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
