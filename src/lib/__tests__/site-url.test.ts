import { describe, expect, it } from "vitest";
import { resolveSiteOrigin } from "../site-url";

// Password reset and welcome links are built from this origin and mailed to a user. If an
// attacker can choose it, they can have this app mail a real user a real token pointing at a host
// the attacker controls. The Host header is attacker-controlled on any request, so it may only be
// consulted where a mailed link cannot reach a stranger: local development.
//
// These are the tests that carry AUTH-35, one per branch of the fallback order the register
// states. e2e/password-reset.spec.ts names AUTH-35 too, and proves something these cannot (that a
// real mailed link really does start with the configured origin), but Playwright specs run only
// under `bun run test:e2e` against a live stack. The unit tests below run on every `bun run test`,
// so the register's claim rests on assertions that execute, not on a suite that may not have.
const REQUEST = { host: "evil.example.com", forwardedProto: "https" };

describe("resolveSiteOrigin", () => {
  it("AUTH-35 uses the configured site URL and ignores the request's Host entirely", () => {
    expect(
      resolveSiteOrigin({ siteUrl: "https://huella.cecodes.org.co" }, REQUEST),
    ).toBe("https://huella.cecodes.org.co");
  });

  it("strips a trailing slash so callers can append a path", () => {
    expect(
      resolveSiteOrigin({ siteUrl: "https://huella.cecodes.org.co/" }, REQUEST),
    ).toBe("https://huella.cecodes.org.co");
  });

  // DOMAIN is what the Caddy profile already terminates TLS for, so a deployment that set it has
  // said what its public hostname is. Reusing it means one less variable to get wrong.
  it("AUTH-35 falls back to the deployment's own DOMAIN, over https", () => {
    expect(resolveSiteOrigin({ domain: "huella.cecodes.org.co" }, REQUEST)).toBe(
      "https://huella.cecodes.org.co",
    );
  });

  it("AUTH-35 prefers an explicit site URL over DOMAIN", () => {
    expect(
      resolveSiteOrigin(
        { siteUrl: "https://app.cecodes.org.co", domain: "huella.cecodes.org.co" },
        REQUEST,
      ),
    ).toBe("https://app.cecodes.org.co");
  });

  // docker-compose defaults DOMAIN to "localhost" when unset, which is a real hostname and would
  // otherwise be taken as a deliberate answer.
  it("AUTH-35 does not treat the compose default of localhost as a configured domain", () => {
    expect(resolveSiteOrigin({ domain: "localhost" }, REQUEST)).toBe("");
  });

  it("AUTH-35 falls back to the platform-set deployment host on Vercel", () => {
    expect(resolveSiteOrigin({ vercelUrl: "cecodes-abc123.vercel.app" }, REQUEST)).toBe(
      "https://cecodes-abc123.vercel.app",
    );
  });

  it("AUTH-35 returns nothing rather than trusting the Host header in production", () => {
    expect(resolveSiteOrigin({}, REQUEST)).toBe("");
  });

  it("AUTH-35 trusts the Host header only in development, where localhost has no fixed port", () => {
    expect(
      resolveSiteOrigin(
        { nodeEnv: "development" },
        { host: "localhost:3000", forwardedProto: null },
      ),
    ).toBe("http://localhost:3000");
  });

  it("AUTH-35 rejects a configured site URL that is not an absolute http(s) origin", () => {
    expect(resolveSiteOrigin({ siteUrl: "huella.cecodes.org.co" }, REQUEST)).toBe("");
    expect(resolveSiteOrigin({ siteUrl: "javascript:alert(1)" }, REQUEST)).toBe("");
  });
});
