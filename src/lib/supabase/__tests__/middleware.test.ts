import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST_LOGIN_PATH } from "@/lib/routes";

// The proxy is the only code that runs before a page does, and it answers exactly one question:
// "is this visitor signed in". route-gate.test.ts proves what the app DOES with that answer.
// Nothing proved where the answer comes FROM, which is the half this migration added, and it is
// the half a static check cannot see: both providers return a NextResponse of the same shape.
//
// Three failures can only be caught here.
//
// A local deployment that quietly kept gating on GoTrue. Every user would still be redirected and
// still be let in, so the app would look correct while the credential store it was moved onto had
// no say in who reached a protected page.
//
// A session store that cannot answer letting somebody through. The lookup is a database query in
// front of every request, and "the database blipped" must resolve to "signed out", never to an
// exception thrown out of the proxy or to an allow.
//
// A Supabase token rotated during the request being dropped on a redirect. That is what makes
// AUTH_PROVIDER=supabase a rollback rather than a one-way door: the browser would come back
// holding the stale token and sign itself out.

/** What a real Supabase client hands to setAll when it rotates a token mid-request. */
type RefreshedCookie = { name: string; value: string; options?: { path?: string } };

const readSession = vi.fn();
const supabaseGetUser = vi.fn();
const buildSupabaseClient = vi.fn();
const reportError = vi.fn();

/**
 * Cookies the mocked client writes back during getUser(), i.e. a refresh in flight.
 *
 * Mutated rather than reassigned: the mock factory closes over this binding once, and a test that
 * replaced the array would be writing somewhere the client can no longer see.
 */
const refreshed: RefreshedCookie[] = [];

vi.mock("@supabase/ssr", () => ({
  createServerClient: (
    url: string,
    anonKey: string,
    options: { cookies: { setAll: (cookies: RefreshedCookie[]) => void } },
  ) => {
    buildSupabaseClient(url, anonKey);
    return {
      auth: {
        async getUser() {
          if (refreshed.length > 0) options.cookies.setAll(refreshed);
          return supabaseGetUser();
        },
      },
    };
  },
}));

// The real SESSION_COOKIE is kept. A test carrying its own copy of the name would pass while the
// proxy read a cookie no sign-in ever sets.
vi.mock("@/lib/auth/session", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/auth/session")>()),
  readSession: (token: string | null | undefined) => readSession(token),
}));

// session.ts imports it at module scope. A real client would open a pool to the shared database.
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

vi.mock("@/lib/observability/report-error", () => ({
  reportError: (report: unknown) => reportError(report),
}));

const { SESSION_COOKIE } = await import("@/lib/auth/session");
const { updateSession } = await import("@/lib/supabase/middleware");

const PROTECTED = "/dashboard";
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

const ORIGINAL_ENV = {
  AUTH_PROVIDER: process.env.AUTH_PROVIDER,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
};

function setEnv(name: keyof typeof ORIGINAL_ENV, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

beforeEach(() => {
  vi.clearAllMocks();
  refreshed.length = 0;
  readSession.mockResolvedValue(null);
  supabaseGetUser.mockResolvedValue({ data: { user: null } });
  setEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  setEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
});

afterEach(() => {
  setEnv("AUTH_PROVIDER", ORIGINAL_ENV.AUTH_PROVIDER);
  setEnv("NEXT_PUBLIC_SUPABASE_URL", ORIGINAL_ENV.NEXT_PUBLIC_SUPABASE_URL);
  setEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", ORIGINAL_ENV.NEXT_PUBLIC_SUPABASE_ANON_KEY);
});

describe("AUTH_PROVIDER=local", () => {
  beforeEach(() => {
    setEnv("AUTH_PROVIDER", "local");
  });

  it("sends an anonymous visitor to the sign-in page", async () => {
    const response = await updateSession(request(PROTECTED));

    expect(response.status).toBe(307);
    expect(location(response)).toBe(SIGN_IN);
  });

  it("resolves the session cookie against our own store and asks GoTrue nothing", async () => {
    readSession.mockResolvedValue(SESSION_USER);

    const response = await updateSession(request(PROTECTED, TOKEN));

    expect(response.status).toBe(200);
    expect(readSession).toHaveBeenCalledWith(TOKEN);
    expect(buildSupabaseClient).not.toHaveBeenCalled();
    expect(supabaseGetUser).not.toHaveBeenCalled();
  });

  // The one that would go unnoticed: GoTrue still holds every account, so a local deployment that
  // kept asking it would let the right people in for the wrong reason, and the cutover would not
  // have happened.
  it("refuses a visitor GoTrue would have admitted", async () => {
    supabaseGetUser.mockResolvedValue({ data: { user: SESSION_USER } });

    const response = await updateSession(request(PROTECTED, TOKEN));

    expect(location(response)).toBe(SIGN_IN);
    expect(buildSupabaseClient).not.toHaveBeenCalled();
  });

  it("forwards a signed-in visitor off a sign-in page", async () => {
    readSession.mockResolvedValue(SESSION_USER);

    const response = await updateSession(request(SIGN_IN, TOKEN));

    expect(location(response)).toBe(POST_LOGIN_PATH);
  });

  it("admits nobody when the session store cannot answer", async () => {
    readSession.mockRejectedValue(new Error("connection terminated"));

    const response = await updateSession(request(PROTECTED, TOKEN));

    expect(response.status).toBe(307);
    expect(location(response)).toBe(SIGN_IN);
  });

  // The cookie value IS the session. It identifies the request no better than the pathname does
  // and it is the one thing a log must never carry.
  it("reports the failure by pathname and never by cookie", async () => {
    readSession.mockRejectedValue(new Error("connection terminated"));

    await updateSession(request(PROTECTED, TOKEN));

    expect(reportError).toHaveBeenCalledTimes(1);
    const [report] = reportError.mock.calls[0] as [{ context?: unknown }];
    expect(report.context).toEqual({ pathname: PROTECTED });
  });

  // Supabase env is not read on this path, so a self-hosted deployment must not be refused over
  // it. The 503 in the other branch is for a Supabase deployment that is genuinely misconfigured.
  it("does not refuse the request over Supabase env it never reads", async () => {
    setEnv("NEXT_PUBLIC_SUPABASE_URL", undefined);
    setEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", undefined);

    const response = await updateSession(request(SIGN_IN));

    expect(response.status).toBe(200);
  });
});

describe("AUTH_PROVIDER=supabase, the rollback", () => {
  beforeEach(() => {
    setEnv("AUTH_PROVIDER", "supabase");
  });

  it("gates on GoTrue and never reads our session cookie", async () => {
    const response = await updateSession(request(PROTECTED, TOKEN));

    expect(location(response)).toBe(SIGN_IN);
    expect(readSession).not.toHaveBeenCalled();
  });

  it("lets a GoTrue user through", async () => {
    supabaseGetUser.mockResolvedValue({ data: { user: SESSION_USER } });

    const response = await updateSession(request(PROTECTED));

    expect(response.status).toBe(200);
  });

  // NextResponse.redirect() starts with no cookies at all, so the copy in applyDecision is the
  // only thing carrying a token rotated during this request. Lose it and the browser comes back
  // holding the stale one, which reads as a random sign-out.
  it("carries a token rotated during the request onto the redirect", async () => {
    refreshed.push({ name: "sb-access-token", value: "rotated", options: { path: "/" } });

    const response = await updateSession(request(PROTECTED));

    expect(location(response)).toBe(SIGN_IN);
    expect(response.cookies.get("sb-access-token")?.value).toBe("rotated");
  });

  it("refuses every request while the Supabase env still holds the placeholder", async () => {
    setEnv("NEXT_PUBLIC_SUPABASE_URL", "https://<project-ref>.supabase.co");

    const response = await updateSession(request(PROTECTED));

    expect(response.status).toBe(503);
    expect(buildSupabaseClient).not.toHaveBeenCalled();
  });

  it("is what an unset AUTH_PROVIDER means", async () => {
    setEnv("AUTH_PROVIDER", undefined);
    supabaseGetUser.mockResolvedValue({ data: { user: SESSION_USER } });

    const response = await updateSession(request(SIGN_IN));

    expect(location(response)).toBe(POST_LOGIN_PATH);
    expect(readSession).not.toHaveBeenCalled();
  });
});

// Shadow doubles up the PASSWORD check at sign-in and nothing else. A shadow mode that gated on
// our own sessions would be the cutover rather than a rehearsal of it, and the rehearsal would
// have proved nothing about the day it is turned on.
describe("AUTH_PROVIDER=shadow", () => {
  it("keeps the gate on GoTrue", async () => {
    setEnv("AUTH_PROVIDER", "shadow");
    readSession.mockResolvedValue(SESSION_USER);

    const response = await updateSession(request(PROTECTED, TOKEN));

    expect(location(response)).toBe(SIGN_IN);
    expect(readSession).not.toHaveBeenCalled();
    expect(supabaseGetUser).toHaveBeenCalled();
  });
});
