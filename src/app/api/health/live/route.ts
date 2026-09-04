import { NextResponse } from "next/server";

// Liveness: is this process running and able to serve a response at all?
//
// It deliberately checks NOTHING else. A liveness probe that touches the database restarts a
// healthy container every time the database blips, which turns a brief outage into a crash loop.
// "Can it serve traffic yet" is a different question and lives in ../ready.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ status: "alive" }, { status: 200 });
}
