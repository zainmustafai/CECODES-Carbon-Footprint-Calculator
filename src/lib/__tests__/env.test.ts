import { describe, expect, it } from "vitest";
import { authProvider, mailConfigured, validateRuntimeEnv } from "../env";

// This contract is the app's only chance to refuse a bad deployment: src/instrumentation.ts calls
// validateRuntimeEnv() once and exits non-zero if it throws. Everything it lets through boots and
// serves traffic, so the cases worth pinning are the ones where a wrong value would otherwise be
// discovered by a user rather than by the operator who typed it.

/** A deployment that should boot: the three genuinely required variables, nothing else. */
const VALID: Record<string, string | undefined> = {
  DATABASE_URL: "postgresql://user:pw@db.example.org:6543/postgres",
  NEXT_PUBLIC_SUPABASE_URL: "https://abcdefgh.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
};

function boot(overrides: Record<string, string | undefined> = {}) {
  return () => validateRuntimeEnv({ ...VALID, ...overrides });
}

describe("validateRuntimeEnv", () => {
  it("boots on the three required variables alone", () => {
    expect(boot()).not.toThrow();
  });

  // An empty .env is the commonest first run, and it used to fail with three identical lines
  // reading "Invalid input: expected string, received undefined". A boot message that names
  // nothing leaves the operator exactly where they started.
  it("names every variable at fault, absent ones included", () => {
    let message = "";
    try {
      validateRuntimeEnv({});
    } catch (error) {
      message = (error as Error).message;
    }
    for (const name of [
      "DATABASE_URL",
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    ]) {
      expect(message).toContain(name);
    }
    // Every reported line carries a variable name, so none of them is anonymous.
    const reported = message.split("\n").filter((line) => line.startsWith("  - "));
    expect(reported).toHaveLength(3);
    for (const line of reported) {
      expect(line).toMatch(/DATABASE_URL|NEXT_PUBLIC_SUPABASE_URL|NEXT_PUBLIC_SUPABASE_ANON_KEY/);
    }
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

  it("rejects the .env.example placeholders rather than booting with them", () => {
    expect(boot({ NEXT_PUBLIC_SUPABASE_URL: "https://<project-ref>.supabase.co" })).toThrow(
      /NEXT_PUBLIC_SUPABASE_URL/,
    );
    expect(
      boot({ RESEND_API_KEY: "<resend-api-key>", MAIL_FROM: "CECODES <a@example.org>" }),
    ).toThrow(/RESEND_API_KEY/);
  });

  describe("optional variables", () => {
    // An operator turning something off empties the line instead of deleting it, and compose
    // hands that through as "". Treating it as a value would stop the container.
    it("reads an empty or blank value the same as an absent one", () => {
      expect(boot({ SITE_URL: "", AUTH_PROVIDER: "", MAIL_FROM: "", RESEND_API_KEY: "" })).not.toThrow();
      expect(boot({ SITE_URL: "   ", AUTH_PROVIDER: "  " })).not.toThrow();
    });

    // The readers of these variables all call .trim() on the raw string. If the schema did not,
    // AUTH_PROVIDER="local " would refuse the boot with a message listing "local" as allowed.
    it("strips surrounding whitespace instead of failing on it", () => {
      expect(boot({ AUTH_PROVIDER: " local " })).not.toThrow();
      expect(boot({ SITE_URL: " https://huella.example.org " })).not.toThrow();
      expect(authProvider({ AUTH_PROVIDER: " local " })).toBe("local");
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

  describe("AUTH_PROVIDER", () => {
    it("accepts each of the three modes", () => {
      for (const mode of ["supabase", "shadow", "local"]) {
        expect(boot({ AUTH_PROVIDER: mode })).not.toThrow();
      }
    });

    // A typo here decides where passwords are checked, so it must stop the boot rather than fall
    // back at runtime to a mode the operator did not ask for.
    it("refuses anything else, including a mode in the wrong case", () => {
      expect(boot({ AUTH_PROVIDER: "locel" })).toThrow(/AUTH_PROVIDER/);
      expect(boot({ AUTH_PROVIDER: "LOCAL" })).toThrow(/AUTH_PROVIDER/);
    });
  });

  describe("the mail pair", () => {
    it("boots with both set and with neither", () => {
      expect(boot()).not.toThrow();
      expect(
        boot({ RESEND_API_KEY: "re_live_key", MAIL_FROM: "CECODES <no-reply@example.org>" }),
      ).not.toThrow();
    });

    // Half a mail configuration is always a mistake, and it is invisible everywhere else: the app
    // boots, every page works, and password reset is quietly dead until somebody reads a log line
    // that only appears once a user has already asked for one.
    it("refuses half a configuration, naming the missing half", () => {
      expect(boot({ RESEND_API_KEY: "re_live_key" })).toThrow(/MAIL_FROM/);
      expect(boot({ MAIL_FROM: "CECODES <no-reply@example.org>" })).toThrow(/RESEND_API_KEY/);
    });

    // A From header is normally "Name <address>", which is not an email address by itself, so the
    // only shape worth rejecting is one with no address in it at all.
    it("accepts a display-name From and rejects one with no address", () => {
      expect(
        boot({ RESEND_API_KEY: "re_live_key", MAIL_FROM: "CECODES <no-reply@example.org>" }),
      ).not.toThrow();
      expect(boot({ RESEND_API_KEY: "re_live_key", MAIL_FROM: "CECODES" })).toThrow(/MAIL_FROM/);
    });
  });
});

describe("authProvider", () => {
  // Unset is the answer every existing deployment gives, and it has to keep meaning "nothing
  // changes" until the cutover commit.
  it("answers supabase when the variable is unset", () => {
    expect(authProvider({})).toBe("supabase");
    expect(authProvider({ AUTH_PROVIDER: "" })).toBe("supabase");
  });

  it("answers with the configured mode", () => {
    expect(authProvider({ AUTH_PROVIDER: "shadow" })).toBe("shadow");
    expect(authProvider({ AUTH_PROVIDER: "local" })).toBe("local");
  });

  // Read on the sign-in path, so it falls back rather than throwing: a value validateRuntimeEnv
  // would have refused at boot must not become a 500 for every user in a process that never ran it.
  it("falls back to supabase on a value it cannot read", () => {
    expect(authProvider({ AUTH_PROVIDER: "locel" })).toBe("supabase");
    expect(authProvider({ AUTH_PROVIDER: "LOCAL" })).toBe("supabase");
  });
});

describe("mailConfigured", () => {
  it("is true only when both halves carry a value", () => {
    expect(mailConfigured({ RESEND_API_KEY: "re_live_key", MAIL_FROM: "a@example.org" })).toBe(true);
    expect(mailConfigured({ RESEND_API_KEY: "re_live_key" })).toBe(false);
    expect(mailConfigured({ MAIL_FROM: "a@example.org" })).toBe(false);
    expect(mailConfigured({})).toBe(false);
  });

  it("does not count a blank value as configuration", () => {
    expect(mailConfigured({ RESEND_API_KEY: "   ", MAIL_FROM: "a@example.org" })).toBe(false);
  });
});
