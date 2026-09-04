import { describe, expect, it, vi } from "vitest";

// Server Actions are public POST endpoints. Everything the login form enforces in the browser is
// enforced again here, or it is not enforced at all: a hand-crafted request never runs React Hook
// Form. These tests pin that each action rejects bad input BEFORE the credential store is ever
// asked.
//
// prisma is an empty object, so any query at all throws rather than passing quietly: a test that
// reaches the database despite bad input fails loudly instead of silently succeeding.

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

const {
  signUpAction,
  signInAction,
  requestPasswordResetAction,
  resetPasswordWithTokenAction,
  updatePasswordAction,
} = await import("../auth-actions");

describe("signUpAction while self-serve registration is closed", () => {
  it("refuses with registrationDisabled unconditionally", async () => {
    expect(
      await signUpAction({ email: "someone@example.com", password: "supersecret" }),
    ).toEqual({ error: "registrationDisabled" });
  });
});

describe("signInAction input validation", () => {
  it("rejects a malformed email without touching the database", async () => {
    expect(await signInAction({ email: "not-an-email", password: "supersecret" })).toEqual({
      error: "invalidInput",
    });
  });

  it("rejects an empty password without touching the database", async () => {
    expect(await signInAction({ email: "someone@example.com", password: "" })).toEqual({
      error: "invalidInput",
    });
  });

  it("AUTH-11 rejects unknown fields, so no extra key can ride along to the credential check", async () => {
    const input = {
      email: "someone@example.com",
      password: "supersecret",
      options: { data: { role: "ADMIN" } },
    };
    expect(await signInAction(input as never)).toEqual({ error: "invalidInput" });
  });

  // The other half of AUTH-11: EMAIL_MAX (auth-server-schemas.ts) bounds the address itself, not
  // only its shape, because auth_throttle.key is built as "email:" plus this same string and is a
  // TEXT PRIMARY KEY. RED, deliberately, before this assertion: expecting the WRONG result first
  // (`.not.toEqual({ error: "invalidInput" })`) failed with the actual value `{ error:
  // "invalidInput" }`, which is only possible if the schema really does reject this input before
  // signInWithCredentials ever runs (prisma is `{}`, so reaching the credential store throws and
  // answers "generic", never "invalidInput"). That confirms this assertion is not vacuously true.
  it("AUTH-11 rejects an oversized email without touching the database", async () => {
    const oversizedEmail = `${"a".repeat(300)}@example.com`;
    expect(await signInAction({ email: oversizedEmail, password: "supersecret" })).toEqual({
      error: "invalidInput",
    });
  });
});

describe("updatePasswordAction input validation", () => {
  // The documented 8-character minimum lives only here: nothing upstream enforces it.
  it("rejects a password below the documented minimum without touching the database", async () => {
    expect(await updatePasswordAction({ password: "1234567" })).toEqual({ error: "invalidInput" });
  });

  it("rejects a non-object payload", async () => {
    expect(await updatePasswordAction(undefined as never)).toEqual({ error: "invalidInput" });
  });
});

describe("requestPasswordResetAction input validation", () => {
  it("ignores a malformed email and still reveals nothing by returning undefined", async () => {
    await expect(requestPasswordResetAction("not-an-email")).resolves.toBeUndefined();
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
});
