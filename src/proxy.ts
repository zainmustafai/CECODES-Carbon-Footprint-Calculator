import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Next.js 16 "proxy" convention (formerly middleware). Refreshes the Supabase session per request.
export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // Run on everything except Next internals, static assets, and the health probes.
    //
    // The health routes are excluded for two reasons: updateSession would redirect an
    // unauthenticated probe to /login (so an orchestrator would read a 307 instead of the real
    // status), and it calls supabase.auth.getUser() on every matched request - an outbound
    // round trip to Supabase Auth that a probe running every few seconds should not pay.
    "/((?!_next/static|_next/image|favicon.ico|api/health|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
