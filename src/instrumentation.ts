import { validateRuntimeEnv } from "@/lib/env";

/**
 * Next's boot hook: the one place this app can refuse to start.
 *
 * A Next app has no main(), so without this a misconfigured deployment starts happily and fails
 * per-request instead - which is exactly the "partially initialized state" a container deployment
 * must avoid. Throwing here stops the server before it accepts traffic, so the container exits
 * non-zero and the orchestrator reports a failure instead of a healthy-looking app that 500s.
 *
 * Runs once per server process, on Vercel and in a container alike.
 */
export function register() {
  // The edge runtime never opens the database and never sends mail, which is all
  // validateRuntimeEnv checks; there is nothing to validate there.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  try {
    validateRuntimeEnv();
  } catch (error) {
    // Exit rather than rethrow. Next catches a throw from this hook and reports
    // "Failed to prepare server", but the process stays alive and never serves - a container
    // that is running, never healthy, and has no exit code to explain itself. Exiting non-zero
    // makes `docker compose ps` and `docker compose logs` tell the truth immediately.
    console.error(error instanceof Error ? error.message : String(error));

    // Reached through globalThis on purpose. This file is compiled for the edge runtime as well
    // as node, and a literal `process.exit(...)` makes the bundler warn that a Node API is
    // unsupported on edge - even though the guard above means edge never runs this line. Going
    // through globalThis keeps the build output clean, and a build warning nobody can act on is
    // how real warnings end up ignored.
    (globalThis as unknown as { process: { exit(code: number): never } }).process.exit(1);
  }
}
