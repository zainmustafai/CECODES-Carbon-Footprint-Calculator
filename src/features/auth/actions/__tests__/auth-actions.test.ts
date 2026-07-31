import { describe, expect, it, vi } from "vitest";

// Self-serve registration is closed (FEATURE_SELF_ONBOARDING). The UI hides /register, but a
// Server Action is a public POST endpoint, so the action itself must refuse. This test pins
// that: the guard fires BEFORE any Supabase client is constructed, so flipping the flag back
// on is the only way to reopen the path.

const createClient = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ createClient: () => createClient() }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

const { signUpAction } = await import("../auth-actions");

describe("signUpAction while self-serve registration is closed", () => {
  it("refuses with registrationDisabled and never reaches Supabase", async () => {
    expect(
      await signUpAction({ email: "someone@example.com", password: "supersecret" }),
    ).toEqual({ error: "registrationDisabled" });
    expect(createClient).not.toHaveBeenCalled();
  });
});
