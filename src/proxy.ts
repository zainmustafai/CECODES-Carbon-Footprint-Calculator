import { type NextRequest } from "next/server";
import { gate } from "@/lib/auth/route-gate";

// Next.js 16 "proxy" convention (formerly middleware). Applies the route gate per request.
export async function proxy(request: NextRequest) {
  return await gate(request);
}

export const config = {
  matcher: [
    // Run on everything except Next internals, static assets, and the health probes.
    //
    // The health routes are excluded because the gate would redirect an unauthenticated probe to
    // /login, so an orchestrator would read a 307 instead of the real status.
    "/((?!_next/static|_next/image|favicon.ico|api/health|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
