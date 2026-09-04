import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { POST_LOGIN_PATH } from "@/lib/routes";
import { config as proxyConfig } from "@/proxy";

// The route gate is the only thing between an anonymous request and a page nobody remembered to
// guard. So it is tested as what most of it is: a pathname and a boolean in, a decision out, with
// no request and no database anywhere near it. gate() and applyDecision() are the two exceptions,
// covered further down, because they are what turns that decision into an actual response and
// what answers the boolean in the first place.
//
// /register is the one rule that needs the module loaded twice. Its publicness is read off
// FEATURE_SELF_ONBOARDING when the module is imported, so covering both states means importing
// under both. Testing only today's value would leave the other branch unproven until the day
// somebody flips the flag, which is precisely the day it has to be right.

const readSession = vi.fn();
const reportError = vi.fn();

// session.ts imports prisma at module scope. A real client would open a pool to the shared
// database, which nothing in this file needs.
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

vi.mock("@/lib/auth/session", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/auth/session")>()),
  readSession: (token: string | null | undefined) => readSession(token),
}));

vi.mock("@/lib/observability/report-error", () => ({
  reportError: (report: unknown) => reportError(report),
}));

type Gate = typeof import("../route-gate");

async function loadGate(selfOnboarding: boolean): Promise<Gate> {
  vi.resetModules();
  vi.doMock("@/lib/feature-flags", () => ({ FEATURE_SELF_ONBOARDING: selfOnboarding }));
  return import("../route-gate");
}

/** Self-serve onboarding closed, which is the shipped configuration. */
const closed = await loadGate(false);
/** The same rules with the flag open, so /register's other half is covered too. */
const open = await loadGate(true);

afterAll(() => {
  vi.doUnmock("@/lib/feature-flags");
  vi.resetModules();
});

const { isAuthPage, isPublicPath, isUnder, decideRoute, gate, applyDecision } = closed;
const { SESSION_COOKIE } = await import("@/lib/auth/session");

/** Every sign-in page in the shipped configuration. */
const AUTH_PAGES = ["/login", "/forgot-password"];

/** Public and not a sign-in page: reachable from either side of the gate, never redirected. */
const PUBLIC_NON_AUTH = ["/", "/reset-password"];

/** One of each shape of protected route the app actually serves. */
const PROTECTED = [
  "/dashboard",
  "/data-entry",
  "/preview",
  "/reports",
  "/company",
  "/onboarding",
  "/account-disabled",
  "/admin",
  "/admin/users",
  "/admin/factors/new",
  "/admin/companies/a3f1/dashboard",
  "/api/reports/export",
  // Used to be exempted via PUBLIC_PREFIXES for the Supabase email-link handlers that lived here.
  // Both are gone and PUBLIC_PREFIXES is empty, so this is now an ordinary protected path like any
  // other: nothing is public here just because something used to be.
  "/auth/confirm",
];

// PUBLIC_PREFIXES is empty (Ruling 21), so nothing reaches isUnder through isPublicPath's
// PUBLIC_PREFIXES.some() call today - that branch is always false regardless of which matching
// rule it runs, because there is nothing in the array to match. isAuthPage's use of isUnder over
// AUTH_PAGES is still exercised below, but AUTH_PAGES is a different call site: a regression
// scoped to the PUBLIC_PREFIXES line specifically (e.g. swapping isUnder for a bare
// pathname.startsWith(prefix)) would go uncaught by every other test in this file until the day
// someone adds a prefix, which is exactly the day it would matter. So isUnder is tested directly.
describe("isUnder", () => {
  it("matches the base path itself", () => {
    expect(isUnder("/auth", "/auth")).toBe(true);
  });

  it("matches anything nested under the base", () => {
    expect(isUnder("/auth/confirm", "/auth")).toBe(true);
  });

  // The whole-segment rule. A bare startsWith(base) would also match this, silently granting
  // "/authors" whatever "/auth" was granted.
  it("does not extend the base to a path that merely starts with the same letters", () => {
    expect(isUnder("/authors", "/auth")).toBe(false);
  });
});

describe("isAuthPage", () => {
  it.each(AUTH_PAGES)("treats %s as a sign-in page", (path) => {
    expect(isAuthPage(path)).toBe(true);
  });

  it("covers anything nested under a sign-in page", () => {
    expect(isAuthPage("/login/help")).toBe(true);
  });

  // The whole-segment rule. A bare prefix match would make every one of these a sign-in page, and
  // therefore public, on the day somebody adds the route.
  it.each(["/logins", "/login-help", "/forgot-password-reset"])(
    "does not let %s inherit a sign-in page's publicness",
    (path) => {
      expect(isAuthPage(path)).toBe(false);
      expect(isPublicPath(path)).toBe(false);
    },
  );

  it.each([...PUBLIC_NON_AUTH, ...PROTECTED])("does not treat %s as a sign-in page", (path) => {
    expect(isAuthPage(path)).toBe(false);
  });
});

describe("isPublicPath", () => {
  it.each([...AUTH_PAGES, ...PUBLIC_NON_AUTH])("lets an anonymous visitor reach %s", (path) => {
    expect(isPublicPath(path)).toBe(true);
  });

  it.each(PROTECTED)("keeps %s behind the gate", (path) => {
    expect(isPublicPath(path)).toBe(false);
  });
});

describe("decideRoute", () => {
  it.each(PROTECTED)("sends an anonymous visitor from %s to /login", (pathname) => {
    expect(decideRoute({ pathname, signedIn: false })).toEqual({
      kind: "redirect",
      to: "/login",
    });
  });

  it.each([...AUTH_PAGES, ...PUBLIC_NON_AUTH])(
    "lets an anonymous visitor through to %s",
    (pathname) => {
      expect(decideRoute({ pathname, signedIn: false })).toEqual({ kind: "allow" });
    },
  );

  it.each(AUTH_PAGES)("forwards a signed-in visitor off %s", (pathname) => {
    expect(decideRoute({ pathname, signedIn: true })).toEqual({
      kind: "redirect",
      to: POST_LOGIN_PATH,
    });
  });

  it.each(PROTECTED)("lets a signed-in visitor through to %s", (pathname) => {
    expect(decideRoute({ pathname, signedIn: true })).toEqual({ kind: "allow" });
  });

  // The recovery link signs the user in before this page renders, and the account menu reaches it
  // with a session already. Forwarding a signed-in visitor away, the way a sign-in page does,
  // would mean nobody could ever change a password.
  it("leaves a signed-in visitor on /reset-password", () => {
    expect(decideRoute({ pathname: "/reset-password", signedIn: true })).toEqual({ kind: "allow" });
  });

  // The landing page is public in both directions. Forwarding a signed-in visitor off it would
  // make the site's own front door unreachable to the people who use it.
  it("leaves a signed-in visitor on the landing page", () => {
    expect(decideRoute({ pathname: "/", signedIn: true })).toEqual({ kind: "allow" });
  });
});

describe("/register, gated by FEATURE_SELF_ONBOARDING", () => {
  it("is public, and a sign-in page, only while self-serve onboarding is open", () => {
    expect(open.isAuthPage("/register")).toBe(true);
    expect(open.isPublicPath("/register")).toBe(true);

    expect(closed.isAuthPage("/register")).toBe(false);
    expect(closed.isPublicPath("/register")).toBe(false);
  });

  it("takes an anonymous visitor to /login while onboarding is closed", () => {
    expect(closed.decideRoute({ pathname: "/register", signedIn: false })).toEqual({
      kind: "redirect",
      to: "/login",
    });
  });

  it("lets an anonymous visitor register while onboarding is open", () => {
    expect(open.decideRoute({ pathname: "/register", signedIn: false })).toEqual({ kind: "allow" });
  });

  it("forwards a signed-in visitor off /register while onboarding is open", () => {
    expect(open.decideRoute({ pathname: "/register", signedIn: true })).toEqual({
      kind: "redirect",
      to: POST_LOGIN_PATH,
    });
  });

  // Closed, /register is an ordinary protected path: the gate does not forward a signed-in
  // visitor, and the page itself is what turns them away. Asserted so a later change to the gate
  // cannot quietly take that job off the page without failing here.
  it("leaves a signed-in visitor to the page itself while onboarding is closed", () => {
    expect(closed.decideRoute({ pathname: "/register", signedIn: true })).toEqual({
      kind: "allow",
    });
  });
});

// Moved here from the deleted src/lib/supabase/__tests__/middleware.test.ts, which tested the same
// guarantees through updateSession() back when the configured auth provider was something the
// middleware had to branch on. There is no provider now, and gate() is the whole of it: a pathname
// and a cookie in, a NextResponse out, with a real session store mocked underneath.
//
// Two failures can only be caught here, not in the decideRoute suite above. A session store that
// cannot answer letting somebody through: the lookup is a database query in front of every
// request, and "the database blipped" must resolve to signed out, never to an exception thrown out
// of the proxy or to an allow. And a cookie value reaching a log line: it identifies the request no
// better than the pathname does, and it is the one thing a log must never carry.

const A_PROTECTED_PATH = "/dashboard";
const SIGN_IN = "/login";
const TOKEN = "cookie-value-that-must-never-be-logged";
const SESSION_USER = { id: "u-1", email: "someone@example.org" };

function request(pathname: string, sessionCookie?: string) {
  const req = new NextRequest(`http://localhost${pathname}`);
  if (sessionCookie) req.cookies.set(SESSION_COOKIE, sessionCookie);
  return req;
}

function location(response: Response): string | null {
  const header = response.headers.get("location");
  return header ? new URL(header).pathname : null;
}

beforeEach(() => {
  vi.clearAllMocks();
  readSession.mockResolvedValue(null);
});

describe("gate", () => {
  it("AUTH-52 sends an anonymous visitor to the sign-in page", async () => {
    const response = await gate(request(A_PROTECTED_PATH));

    expect(response.status).toBe(307);
    expect(location(response)).toBe(SIGN_IN);
  });

  // decideRoute's own comment says the redirect keeps no part of the original URL, not even as
  // ?next=: an earlier version of the register wrongly claimed the destination survived, and this
  // is the test that would catch that claim coming back. Checked on the actual Response, past
  // decideRoute, because applyDecision is what builds the URL and could reintroduce the query on
  // its own even if decideRoute never mentions one.
  it("AUTH-52 keeps no part of the original URL in the redirect, not even as ?next=", async () => {
    const response = await gate(request(`${A_PROTECTED_PATH}?next=%2Fadmin&secret=1`));

    const header = response.headers.get("location");
    expect(header).not.toBeNull();
    const redirectUrl = new URL(header!);
    expect(redirectUrl.pathname).toBe(SIGN_IN);
    expect(redirectUrl.search).toBe("");
  });

  it("resolves the session cookie against the session store", async () => {
    readSession.mockResolvedValue(SESSION_USER);

    const response = await gate(request(A_PROTECTED_PATH, TOKEN));

    expect(response.status).toBe(200);
    expect(readSession).toHaveBeenCalledWith(TOKEN);
  });

  it("AUTH-53 forwards a signed-in visitor off a sign-in page", async () => {
    readSession.mockResolvedValue(SESSION_USER);

    const response = await gate(request(SIGN_IN, TOKEN));

    expect(location(response)).toBe(POST_LOGIN_PATH);
  });

  // The one a static check cannot see: the failure mode of the lookup itself.
  it("admits nobody when the session store cannot answer", async () => {
    readSession.mockRejectedValue(new Error("connection terminated"));

    const response = await gate(request(A_PROTECTED_PATH, TOKEN));

    expect(response.status).toBe(307);
    expect(location(response)).toBe(SIGN_IN);
  });

  // The cookie value IS the session. It identifies the request no better than the pathname does
  // and it is the one thing a log must never carry.
  it("reports the failure by pathname and never by cookie", async () => {
    readSession.mockRejectedValue(new Error("connection terminated"));

    await gate(request(A_PROTECTED_PATH, TOKEN));

    expect(reportError).toHaveBeenCalledTimes(1);
    const [report] = reportError.mock.calls[0] as [{ context?: unknown }];
    expect(report.context).toEqual({ pathname: A_PROTECTED_PATH });
  });
});

describe("applyDecision", () => {
  // NextResponse.redirect() starts with no cookies at all, so this copy is the only thing that
  // could carry a cookie set earlier in the same request onto a redirect. Losing it logs a visitor
  // out on every gated navigation that also happens to redirect. gate() itself never hands this a
  // refreshed response that holds a cookie, so this is proven directly rather than through gate().
  it("AUTH-54 carries a cookie from the refreshed response onto a redirect", () => {
    const req = request(A_PROTECTED_PATH);
    const refreshed = NextResponse.next({ request: req });
    refreshed.cookies.set("carried", "value");

    const response = applyDecision(req, { kind: "redirect", to: SIGN_IN }, refreshed);

    expect(location(response)).toBe(SIGN_IN);
    expect(response.cookies.get("carried")?.value).toBe("value");
  });

  it("returns the refreshed response unchanged when the decision is allow", () => {
    const req = request(A_PROTECTED_PATH);
    const refreshed = NextResponse.next({ request: req });

    expect(applyDecision(req, { kind: "allow" }, refreshed)).toBe(refreshed);
  });
});

// The other half of AUTH-54: the exclusion is not decided by anything in this file. It is
// src/proxy.ts's `config.matcher`, read at build time by Next itself, so gate() never sees a
// request for /api/health/* at all. A hand-rolled RegExp built from that matcher string would
// only prove that OUR reading of Next's matcher syntax excludes the path, which can silently
// diverge from how Next actually compiles it. `unstable_doesMiddlewareMatch` is Next's own
// testing utility for exactly this (see the "Unit testing (experimental)" section of the Proxy
// docs), so this runs the real compiler against the real exported config.
describe("the proxy matcher, config.matcher in src/proxy.ts", () => {
  function reachesGate(pathname: string): boolean {
    return unstable_doesMiddlewareMatch({ config: proxyConfig, url: `http://localhost${pathname}` });
  }

  it("AUTH-54 excludes every /api/health/* path from ever reaching the gate", () => {
    expect(reachesGate("/api/health")).toBe(false);
    expect(reachesGate("/api/health/live")).toBe(false);
    expect(reachesGate("/api/health/ready")).toBe(false);
  });

  // Not part of AUTH-54 itself, but without this the test above could pass by excluding
  // everything, which would be a gate that protects nothing rather than one that skips a probe.
  it("still sends an ordinary protected path through to the gate", () => {
    expect(reachesGate("/dashboard")).toBe(true);
    expect(reachesGate("/login")).toBe(true);
  });
});
