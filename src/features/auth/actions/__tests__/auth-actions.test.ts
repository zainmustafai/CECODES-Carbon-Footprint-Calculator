import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";

// Server Actions are public POST endpoints. Everything the login form enforces in the browser is
// enforced again here, or it is not enforced at all: a hand-crafted request never runs React Hook
// Form. These tests pin that each action rejects bad input BEFORE a credential store exists, which
// is the only way to be sure Supabase's own (weaker) rules are never what decides the outcome.
//
// The mocks are what make that assertable: prisma is an empty object, so any query at all throws
// rather than passing quietly, and createClient is a spy that never has to answer.

const createClient = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ createClient: () => createClient() }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

const {
  signUpAction,
  signInAction,
  requestPasswordResetAction,
  resetPasswordWithTokenAction,
  updatePasswordAction,
} = await import("../auth-actions");

beforeEach(() => {
  createClient.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
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
    expect(await updatePasswordAction({ password: "1234567" })).toEqual({ error: "invalidInput" });
    expect(createClient).not.toHaveBeenCalled();
  });

  it("rejects a non-object payload", async () => {
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

describe("resetPasswordWithTokenAction input validation", () => {
  it("rejects an empty token before anything is looked up", async () => {
    expect(
      await resetPasswordWithTokenAction({ token: "", password: "supersecret" }),
    ).toEqual({ error: "invalidInput" });
  });

  // The same 8-character minimum the signed-in path enforces. A reset link is the one way into an
  // account that does not need the old password, so it is the last place to relax the rule.
  it("rejects a password below the documented minimum", async () => {
    expect(
      await resetPasswordWithTokenAction({ token: "a-token", password: "1234567" }),
    ).toEqual({ error: "invalidInput" });
  });

  it("rejects unknown fields, so nothing can ride along to the password write", async () => {
    const input = { token: "a-token", password: "supersecret", userId: "someone-else" };
    expect(await resetPasswordWithTokenAction(input as never)).toEqual({ error: "invalidInput" });
  });

  // Outside local mode GoTrue still holds the password, so writing a hash here would tell a user
  // their password had changed while the one that opens the door had not.
  it("refuses well-formed input while Supabase is the provider, without a query", async () => {
    expect(
      await resetPasswordWithTokenAction({ token: "a-token", password: "supersecret" }),
    ).toEqual({ error: "invalidResetLink" });
  });
});

describe("input validation does not depend on the provider", () => {
  // The gate has to sit in front of the branch, not inside one arm of it: local mode is the arm
  // with no upstream validation at all behind it.
  it("rejects the same payloads in local mode, without reaching the database", async () => {
    vi.stubEnv("AUTH_PROVIDER", "local");

    expect(await signInAction({ email: "not-an-email", password: "supersecret" })).toEqual({
      error: "invalidInput",
    });
    expect(await signInAction({ email: "someone@example.com", password: "" })).toEqual({
      error: "invalidInput",
    });
    expect(await updatePasswordAction({ password: "1234567" })).toEqual({ error: "invalidInput" });
    await expect(requestPasswordResetAction("not-an-email")).resolves.toBeUndefined();
    expect(createClient).not.toHaveBeenCalled();
  });
});
