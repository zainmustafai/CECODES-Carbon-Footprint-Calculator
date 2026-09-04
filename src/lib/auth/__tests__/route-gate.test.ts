import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { POST_LOGIN_PATH } from "@/lib/routes";

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

const { isAuthPage, isPublicPath, decideRoute, gate, applyDecision } = closed;
const { SESSION_COOKIE } = await import("@/lib/auth/session");

/** Every sign-in page in the shipped configuration. */
const AUTH_PAGES = ["/login", "/forgot-password"];

/** Public and not a sign-in page: reachable from either side of the gate, never redirected. */
const PUBLIC_NON_AUTH = ["/", "/reset-password", "/auth", "/auth/callback", "/auth/confirm"];

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
];

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

  // "/auth" is a prefix because the email-link handlers live under it, not because those five
  // characters are special.
  it("does not extend the /auth prefix to a path that merely starts with those letters", () => {
    expect(isPublicPath("/authors")).toBe(false);
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

  // Reaching the handler is what creates the session, so a signed-out visitor has to get through.
  it("lets an anonymous visitor finish an email link under /auth", () => {
    expect(decideRoute({ pathname: "/auth/confirm", signedIn: false })).toEqual({ kind: "allow" });
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
// guarantees through updateSession() when there were two providers to gate on. Now there is one,
// and gate() is it: a pathname and a cookie in, a NextResponse out, with a real session store
// mocked underneath.
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
  it("sends an anonymous visitor to the sign-in page", async () => {
    const response = await gate(request(A_PROTECTED_PATH));

    expect(response.status).toBe(307);
    expect(location(response)).toBe(SIGN_IN);
  });

  it("resolves the session cookie against the session store", async () => {
    readSession.mockResolvedValue(SESSION_USER);

    const response = await gate(request(A_PROTECTED_PATH, TOKEN));

    expect(response.status).toBe(200);
    expect(readSession).toHaveBeenCalledWith(TOKEN);
  });

  it("forwards a signed-in visitor off a sign-in page", async () => {
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
  it("carries a cookie from the refreshed response onto a redirect", () => {
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
