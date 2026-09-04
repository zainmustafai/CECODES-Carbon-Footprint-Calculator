import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { decideRoute, type GateDecision } from "@/lib/auth/route-gate";
import { SESSION_COOKIE, readSession } from "@/lib/auth/session";
import { authProvider } from "@/lib/env";
import { reportError } from "@/lib/observability/report-error";

// Answers one question per request, "is this visitor signed in", and hands the answer to the route
// gate. Only the question is provider-specific; the redirect rules that follow from it are not,
// and they now live in src/lib/auth/route-gate.ts. See that file for why they moved out.

/**
 * Turns a gate decision into the response that is actually sent.
 *
 * `refreshed` is the response the provider has been writing cookies onto. A redirect has to take
 * those cookies with it by hand, because NextResponse.redirect() starts with none: a Supabase
 * token rotated during this request would otherwise be dropped, and the browser would come back
 * carrying the stale one it still holds. Under the local provider there is nothing to refresh and
 * the copy loop finds nothing, which is why this is one helper rather than one per provider.
 */
function applyDecision(
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
async function gateLocal(request: NextRequest): Promise<NextResponse> {
  const signedIn = await hasLocalSession(request);
  return applyDecision(
    request,
    decideRoute({ pathname: request.nextUrl.pathname, signedIn }),
    NextResponse.next({ request }),
  );
}

/**
 * AUTH_PROVIDER=supabase and AUTH_PROVIDER=shadow, which is every deployment today.
 *
 * Shadow belongs here rather than on the local path: it verifies the local hash alongside GoTrue
 * and logs the disagreement, but GoTrue still decides the sign-in, so the gate has to keep asking
 * GoTrue who is here. A shadow mode that quietly gated on our own sessions would be the cutover,
 * not a rehearsal of it.
 */
async function gateSupabase(request: NextRequest): Promise<NextResponse> {
  let supabaseResponse = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Misconfigured Supabase env: refuse every request rather than serve any.
  //
  // This used to `return supabaseResponse`, i.e. fall through. That skipped the redirect gating
  // below, so a deployment with a missing or placeholder NEXT_PUBLIC_SUPABASE_URL served every
  // protected route to anyone, with no session and no error. It failed OPEN.
  //
  // That was tolerable when the only deployment was Vercel, where these values are set once in a
  // dashboard. It is not tolerable in a container, where they come from a .env file edited by hand
  // on each server and a typo is ordinary. src/instrumentation.ts should already have stopped the
  // process at boot; this is the second lock on the same door.
  if (!url || !anonKey || url.includes("<project-ref>")) {
    return new NextResponse("Service misconfigured", {
      status: 503,
      headers: { "content-type": "text/plain", "cache-control": "no-store" },
    });
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  // IMPORTANT: keep getUser() immediately after createServerClient.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return applyDecision(
    request,
    decideRoute({ pathname: request.nextUrl.pathname, signedIn: user !== null }),
    supabaseResponse,
  );
}

/** Refreshes the session where there is one to refresh, then applies the route gate. */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  return authProvider() === "local" ? gateLocal(request) : gateSupabase(request);
}
