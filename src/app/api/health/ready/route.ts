import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Readiness: can this instance actually serve a real request?
 *
 * Every meaningful page in this app reads the database, so a reachable database is the honest
 * definition of ready. Returns 503 when it is not, which is what tells a load balancer to stop
 * sending traffic here rather than to restart the container.
 *
 * Why this endpoint exists at all: the obvious alternative, probing "/", is a trap. That route
 * redirects unconditionally (307), so a default healthcheck against it passes while every real
 * request 500s on a dead database.
 *
 * The response body never names the host, the database or the error's own message: a probe
 * endpoint is unauthenticated, and connection errors from pg quote the connection target.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ready", database: "up" }, { status: 200 });
  } catch {
    return NextResponse.json(
      { status: "not_ready", database: "unreachable" },
      { status: 503 },
    );
  }
}
