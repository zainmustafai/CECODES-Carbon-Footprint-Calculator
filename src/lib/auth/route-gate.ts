import { NextResponse, type NextRequest } from "next/server";
import { FEATURE_SELF_ONBOARDING } from "@/lib/feature-flags";
import { POST_LOGIN_PATH } from "@/lib/routes";
import { SESSION_COOKIE, readSession } from "@/lib/auth/session";
import { reportError } from "@/lib/observability/report-error";

// Which paths a visitor may reach, and where they go when they may not. There is no provider in
// this file, and no request either: every rule below is a function of a pathname and one boolean.
//
// The rules used to live inside updateSession() in src/lib/supabase/middleware.ts, interleaved
// with the Supabase client that produced that boolean. One function did two jobs and only one of
// them had anything to do with Supabase, because the redirect table is identical whether the
// verdict came from GoTrue or from a session row in our own database. Splitting it is what lets
// the self-hosted provider reuse the rules verbatim rather than grow a second copy: two copies of
// a redirect table is how a path ends up public under one provider and protected under the other,
// and nobody finds out until it is the wrong way round.
//
// The second reason is that a rule buried in middleware can only be exercised by assembling a
// NextRequest, standing up a fake Supabase client and reading cookies off a Response. Here it is
// exercised by passing a string.

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
 * /reset-password is the one that catches people out, because it is reached from both sides of
 * the gate and for a different reason per provider. Under Supabase the recovery link signs the
 * user in on the way through (src/app/auth/confirm/route.ts) and arrives here WITH a session.
 * Under the self-hosted provider it arrives as ?token=... and the visitor is anonymous on
 * purpose: that token buys one password change and never a session, so a forwarded email cannot
 * become one. Redirecting in either direction would break one of the two.
 *
 * Being listed here is therefore NOT a claim that whoever is on the page holds a session. The
 * page splits on the token itself and calls requireUser() only on the branch that has none, so
 * the guard is per branch, not per page (src/app/reset-password/page.tsx). It sits outside the
 * (auth) route group because that layout forwards anyone with a session, which would strand the
 * no-token branch it exists for.
 */
const PUBLIC_PAGES = ["/", "/reset-password"];

/**
 * Route handlers that finish a Supabase email link: the PKCE code exchange and the token_hash
 * verification.
 *
 * They have to be reachable signed out, because reaching them is what creates the session under
 * that provider. Being listed here grants nothing: each verifies its own token with GoTrue and
 * sends a failure to /login. Under AUTH_PROVIDER=local nothing routes through them at all, and a
 * Supabase cookie one of them sets authenticates nobody, because getUser() reads our own session
 * cookie and never asks GoTrue (src/lib/auth/server.ts).
 */
const PUBLIC_PREFIXES = ["/auth"];

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
 * ride on that response: under Supabase a redirect must carry the auth cookies refreshed during
 * this same request, and under the local provider there is nothing to carry. Building the
 * response here would mean knowing which of the two we are in, which is the coupling this file
 * exists to remove.
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
 * `refreshed` is the response the provider has been writing cookies onto. A redirect has to take
 * those cookies with it by hand, because NextResponse.redirect() starts with none: a Supabase
 * token rotated during this request would otherwise be dropped, and the browser would come back
 * carrying the stale one it still holds. Under the local provider there is nothing to refresh and
 * the copy loop finds nothing, which is why this is one helper rather than one per provider.
 *
 * Exported so its cookie-carrying behaviour can be proven directly: nothing gate() does today
 * hands it a refreshed response that actually holds a cookie, so a test that only calls gate()
 * would never exercise the forEach below.
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
 * AUTH_PROVIDER=local. The session is a row in our own database (src/lib/auth/session.ts), so
 * there is no token to refresh, no Supabase client to build and no outbound round trip to make.
 *
 * The 503 below deliberately does not apply on this path: nothing here reads
 * NEXT_PUBLIC_SUPABASE_URL or its anon key, so refusing every request over them would be a
 * failure the check invented rather than one it caught. They are still REQUIRED at boot in every
 * mode, though (runtimeSchema in src/lib/env.ts, enforced by src/instrumentation.ts), so a
 * deployment that omits them never reaches this function; it exits at startup instead. Relaxing
 * that is the last commit of this migration, and this branch is what has to already be here
 * before that commit can land.
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
