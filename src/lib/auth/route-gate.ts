import { NextResponse, type NextRequest } from "next/server";
import { FEATURE_SELF_ONBOARDING } from "@/lib/feature-flags";
import { POST_LOGIN_PATH } from "@/lib/routes";
import { SESSION_COOKIE, readSession } from "@/lib/auth/session";
import { reportError } from "@/lib/observability/report-error";

// Which paths a visitor may reach, and where they go when they may not. There is no provider in
// this file, and no request either: every rule below is a function of a pathname and one boolean.
//
// Keeping the redirect table separate from the session lookup that produces the boolean is what
// keeps there being exactly one place a path is public or protected, rather than that decision
// being reconstructed wherever a route happens to get checked.
//
// It also means a rule can be exercised by passing a string, rather than assembling a NextRequest,
// standing up a session store and reading cookies off a Response.

const LOGIN_PATH = "/login";

/**
 * Pages whose whole purpose is getting somebody signed in. Reachable while signed out, and
 * pointless once signed in, which is the second redirect in decideRoute.
 *
 * /register is on the list only while self-serve onboarding is open. Closed, which is today, it
 * is an ordinary protected path: an anonymous visit lands on /login and a signed-in visit is
 * turned away by the page itself. One flag gates the entire self-serve path; see
 * src/lib/feature-flags.ts for why a half-open version would be worse than either state.
 */
const AUTH_PAGES = [
  LOGIN_PATH,
  ...(FEATURE_SELF_ONBOARDING ? ["/register"] : []),
  "/forgot-password",
];

/**
 * Public pages that are NOT sign-in pages, so a signed-in visitor stays on them instead of being
 * forwarded away.
 *
 * /reset-password is the one that catches people out, because it is reached both signed in and
 * signed out, for two different reasons. With ?token=..., it is the self-hosted recovery link and
 * the visitor is anonymous on purpose: that token buys one password change and never a session, so
 * a forwarded email cannot become one. Without a token, it is the signed-in "Cambiar contraseña"
 * item in the account menu. Redirecting in either direction would break one of the two.
 *
 * Being listed here is therefore NOT a claim that whoever is on the page holds a session. The
 * page splits on the token itself and calls requireUser() only on the branch that has none, so
 * the guard is per branch, not per page (src/app/reset-password/page.tsx). It sits outside the
 * (auth) route group because that layout forwards anyone with a session, which would strand the
 * no-token branch it exists for.
 */
const PUBLIC_PAGES = ["/", "/reset-password"];

/**
 * Public path PREFIXES, as opposed to the exact-match pages above.
 *
 * Deliberately empty. It used to list "/auth", which existed only so
 * src/app/auth/callback/route.ts and src/app/auth/confirm/route.ts, the Supabase PKCE code
 * exchange and token_hash verification, could be reached signed out. Both are gone: there is no
 * recovery link left to finish, and nothing lives under /auth at all.
 *
 * The array and isUnder below stay rather than being deleted along with the entry, because they
 * are the mechanism for a prefix rule, not the data. Without them, a future route added under some
 * new prefix would have nowhere to declare itself public except by falling through to
 * PUBLIC_PAGES's exact match, which a path with children cannot use. Leaving PUBLIC_PREFIXES empty
 * is also what keeps that future route from being public by default: nothing is exempted here
 * until it is named here.
 */
const PUBLIC_PREFIXES: string[] = [];

/**
 * Whole-segment prefix match, so "/login" covers "/login" and "/login/anything" and stops there.
 *
 * The trailing slash is the entire point. A bare startsWith("/auth"), which is what this replaced,
 * also matches "/authors": any future route whose name merely begins with a public one would
 * inherit its publicness, silently, at the moment it was added.
 */
function isUnder(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(`${base}/`);
}

export function isAuthPage(pathname: string): boolean {
  return AUTH_PAGES.some((page) => isUnder(pathname, page));
}

export function isPublicPath(pathname: string): boolean {
  return (
    isAuthPage(pathname) ||
    PUBLIC_PAGES.includes(pathname) ||
    PUBLIC_PREFIXES.some((prefix) => isUnder(pathname, prefix))
  );
}

/** What the gate decided. The caller turns it into a response. */
export type GateDecision = { kind: "allow" } | { kind: "redirect"; to: string };

/**
 * The whole redirect policy, in one function.
 *
 * It returns a decision rather than a Response because only the caller knows what else has to
 * ride on that response: a redirect has to carry forward any cookie the request already wrote,
 * and building the response here would tangle that mechanics into the policy this file exists to
 * keep separate and easy to test.
 *
 * Deliberately no third answer for "signed in but deactivated". Whether a user may act is decided
 * by src/lib/auth/company-scope.ts on every action and requireAppUser() on every page, both
 * reading the row fresh. Answering it here, from a cookie, would make this a second and quieter
 * authorization boundary that somebody later has to remember to keep in step.
 */
export function decideRoute({
  pathname,
  signedIn,
}: {
  pathname: string;
  signedIn: boolean;
}): GateDecision {
  // The redirect keeps no part of the original URL, not even as ?next=. It costs a signed-out
  // visitor their deep link, and it is what keeps the gate from reflecting an attacker-chosen
  // path into a page that would then have to be trusted to sanitize it.
  if (!signedIn && !isPublicPath(pathname)) return { kind: "redirect", to: LOGIN_PATH };

  // A signed-in visitor on a sign-in page is a bookmark or a back button, not a request to sign
  // in again. Forwarding beats rendering a form whose successful outcome is the state they are
  // already in.
  if (signedIn && isAuthPage(pathname)) return { kind: "redirect", to: POST_LOGIN_PATH };

  return { kind: "allow" };
}

/**
 * Turns a gate decision into the response that is actually sent.
 *
 * `refreshed` is the response NextResponse.next() produced, in case anything upstream of the
 * decision wrote a cookie onto it. A redirect has to carry that cookie forward by hand, because
 * NextResponse.redirect() starts with none: whatever was written would otherwise be dropped, and
 * the browser would keep sending whatever it already held. gate() itself never writes a cookie
 * onto `refreshed` today, so this copy currently finds nothing to carry; it stays in place as the
 * one thing standing between a future cookie write and a silent logout on redirect.
 *
 * Exported only so this cookie-carrying behaviour can be unit-tested directly: gate() never hands
 * it a refreshed response that holds a cookie, so a test that only calls gate() would never
 * exercise the forEach below. It is not part of this module's intended public API.
 */
export function applyDecision(
  request: NextRequest,
  decision: GateDecision,
  refreshed: NextResponse,
): NextResponse {
  if (decision.kind === "allow") return refreshed;

  const redirectUrl = request.nextUrl.clone();
  redirectUrl.pathname = decision.to;
  redirectUrl.search = "";
  const response = NextResponse.redirect(redirectUrl);
  refreshed.cookies.getAll().forEach((cookie) => response.cookies.set(cookie));
  return response;
}

/**
 * Whether the caller holds a live session of ours.
 *
 * A store that cannot answer must not be able to admit anybody, so a lookup that throws reads as
 * "not signed in" rather than as an exception thrown out of the proxy, whose handling belongs to
 * the framework and is not ours to depend on. The blast radius of a database outage is then that
 * everyone looks signed out and no protected path is served; no cookie and no session row is
 * touched, so the first request after it recovers signs them back in.
 */
async function hasLocalSession(request: NextRequest): Promise<boolean> {
  try {
    return (await readSession(request.cookies.get(SESSION_COOKIE)?.value)) !== null;
  } catch (error) {
    // The pathname is safe to log. The cookie value is the session itself and never is.
    reportError({
      where: "proxy route gate",
      error,
      context: { pathname: request.nextUrl.pathname },
    });
    return false;
  }
}

/**
 * The session is a row in our own database (src/lib/auth/session.ts), so there is no token to
 * refresh and no outbound round trip beyond that one lookup.
 *
 * There is no separate fail-closed check here because hasLocalSession already is one: it wraps
 * the lookup in try/catch and returns false on any failure, including a database that cannot be
 * reached, so decideRoute sees signedIn: false and a protected path redirects to /login the same
 * way it would for an ordinary anonymous visitor. Nothing on that path can reach
 * NextResponse.next(). The consequence is that a database outage looks, to a user, like being
 * signed out rather than like an error page; that trade is deliberate, see hasLocalSession above.
 *
 * The cost is one indexed lookup per matched request, which readSession explains. Reading Prisma
 * from here is possible at all because Next 16 runs the proxy on the Node runtime.
 */
export async function gate(request: NextRequest): Promise<NextResponse> {
  const signedIn = await hasLocalSession(request);
  return applyDecision(
    request,
    decideRoute({ pathname: request.nextUrl.pathname, signedIn }),
    NextResponse.next({ request }),
  );
}
