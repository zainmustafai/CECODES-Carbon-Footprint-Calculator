import { describe, expect, it } from "vitest";
import { securityHeaders } from "../security-headers";

// These headers are the app's only defence against a class of attack that never touches our
// code: framing the admin console and stealing a click, or a downgrade on a shared network.
// They are asserted here because next.config.ts is not covered by any other test, and a
// silent deletion during a config edit would otherwise ship unnoticed.
function headerValue(name: string) {
  return securityHeaders().find((h) => h.key.toLowerCase() === name.toLowerCase())?.value;
}

describe("securityHeaders", () => {
  it("refuses to be framed, which is what protects the admin console from clickjacking", () => {
    expect(headerValue("X-Frame-Options")).toBe("DENY");
    expect(headerValue("Content-Security-Policy")).toContain("frame-ancestors 'none'");
  });

  it("pins HTTPS for at least a year, including subdomains", () => {
    const hsts = headerValue("Strict-Transport-Security") ?? "";
    const maxAge = Number(/max-age=(\d+)/.exec(hsts)?.[1] ?? 0);
    expect(maxAge).toBeGreaterThanOrEqual(31_536_000);
    expect(hsts).toContain("includeSubDomains");
  });

  it("stops content-type sniffing and cross-origin referrer leakage", () => {
    expect(headerValue("X-Content-Type-Options")).toBe("nosniff");
    expect(headerValue("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
  });

  it("denies the device APIs this app never uses", () => {
    const policy = headerValue("Permissions-Policy") ?? "";
    for (const feature of ["camera", "microphone", "geolocation"]) {
      expect(policy).toContain(`${feature}=()`);
    }
  });

  it("carries no script-src, because a full CSP is a separate, riskier change", () => {
    expect(headerValue("Content-Security-Policy")).not.toContain("script-src");
  });
});
