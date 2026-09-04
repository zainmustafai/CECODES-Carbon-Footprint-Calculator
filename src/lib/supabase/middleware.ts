import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { FEATURE_SELF_ONBOARDING } from "@/lib/feature-flags";
import { POST_LOGIN_PATH } from "@/lib/routes";

// /register is public only while self-serve onboarding is open; closed, an anonymous visit
// bounces to /login here and a signed-in visit is redirected by the page itself.
const AUTH_PAGES = [
  "/login",
  ...(FEATURE_SELF_ONBOARDING ? ["/register"] : []),
  "/forgot-password",
];

function isAuthPage(pathname: string) {
  return AUTH_PAGES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function isPublic(pathname: string) {
  return (
    isAuthPage(pathname) ||
    pathname === "/reset-password" ||
    pathname === "/" ||
    pathname.startsWith("/auth")
  );
}

// Refreshes the Supabase session AND gates routes (redirect logic centralized here).
export async function updateSession(request: NextRequest) {
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

  const { pathname } = request.nextUrl;

  function redirectTo(path: string) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = path;
    redirectUrl.search = "";
    const response = NextResponse.redirect(redirectUrl);
    // Preserve any refreshed auth cookies on the redirect.
    supabaseResponse.cookies.getAll().forEach((cookie) => response.cookies.set(cookie));
    return response;
  }

  if (!user && !isPublic(pathname)) {
    return redirectTo("/login");
  }
  if (user && isAuthPage(pathname)) {
    return redirectTo(POST_LOGIN_PATH);
  }

  return supabaseResponse;
}
