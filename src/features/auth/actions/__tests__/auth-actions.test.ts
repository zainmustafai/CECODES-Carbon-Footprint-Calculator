import { describe, expect, it, vi, beforeEach } from "vitest";

// Server Actions are public POST endpoints. Everything the login form enforces in the browser is
// enforced again here, or it is not enforced at all: a hand-crafted request never runs React Hook
// Form. These tests pin that each action rejects bad input BEFORE a Supabase client exists, which
// is the only way to be sure Supabase's own (weaker) rules are never what decides the outcome.

const createClient = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ createClient: () => createClient() }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

const {
  signUpAction,
  signInAction,
  requestPasswordResetAction,
  updatePasswordAction,
} = await import("../auth-actions");

beforeEach(() => {
  createClient.mockReset();
});

describe("signUpAction while self-serve registration is closed", () => {
  it("refuses with registrationDisabled and never reaches Supabase", async () => {
    expect(
      await signUpAction({ email: "someone@example.com", password: "supersecret" }),
    ).toEqual({ error: "registrationDisabled" });
    expect(createClient).not.toHaveBeenCalled();
  });
});

describe("signInAction input validation", () => {
  it("rejects a malformed email without contacting Supabase", async () => {
    expect(await signInAction({ email: "not-an-email", password: "supersecret" })).toEqual({
      error: "invalidInput",
    });
    expect(createClient).not.toHaveBeenCalled();
  });

  it("rejects an empty password without contacting Supabase", async () => {
    expect(await signInAction({ email: "someone@example.com", password: "" })).toEqual({
      error: "invalidInput",
    });
    expect(createClient).not.toHaveBeenCalled();
  });

  it("rejects unknown fields, so no extra key can ride along to Supabase", async () => {
    const input = {
      email: "someone@example.com",
      password: "supersecret",
      options: { data: { role: "ADMIN" } },
    };
    expect(await signInAction(input as never)).toEqual({ error: "invalidInput" });
    expect(createClient).not.toHaveBeenCalled();
  });
});

describe("updatePasswordAction input validation", () => {
  // The documented 8-character minimum lived only in the browser schema. Supabase's own floor is
  // 6, so a direct POST used to set a 6-character password on a real account.
  it("rejects a password below the documented minimum without contacting Supabase", async () => {
    expect(await updatePasswordAction("1234567")).toEqual({ error: "invalidInput" });
    expect(createClient).not.toHaveBeenCalled();
  });

  it("rejects a non-string payload", async () => {
    expect(await updatePasswordAction(undefined as never)).toEqual({ error: "invalidInput" });
    expect(createClient).not.toHaveBeenCalled();
  });
});

describe("requestPasswordResetAction input validation", () => {
  it("ignores a malformed email and still reveals nothing by returning undefined", async () => {
    await expect(requestPasswordResetAction("not-an-email")).resolves.toBeUndefined();
    expect(createClient).not.toHaveBeenCalled();
  });
});
