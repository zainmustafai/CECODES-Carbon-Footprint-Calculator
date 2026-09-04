import { describe, expect, it } from "vitest";
import { isEmailInUse } from "@/features/auth/lib/errors";

describe("isEmailInUse", () => {
  it("AUTH-47 recognises a Prisma unique violation on email", () => {
    // P2002 is Prisma's unique constraint failure. The meta.target names the field, which is what
    // separates "this email is taken" from any other unique index on the table.
    const error = Object.assign(new Error("Unique constraint failed"), {
      code: "P2002",
      meta: { target: ["email"] },
    });
    expect(isEmailInUse(error)).toBe(true);
  });

  it("does not treat a unique violation on another column as an email clash", () => {
    const error = Object.assign(new Error("Unique constraint failed"), {
      code: "P2002",
      meta: { target: ["tokenHash"] },
    });
    expect(isEmailInUse(error)).toBe(false);
  });

  it("recognises meta.target as a single field name, not just an array", () => {
    const error = Object.assign(new Error("Unique constraint failed"), {
      code: "P2002",
      meta: { target: "email" },
    });
    expect(isEmailInUse(error)).toBe(true);
  });

  it("recognises Prisma's own index-name fallback for meta.target", () => {
    // Prisma cannot always resolve the failing index back to a field name and falls back to
    // passing the index name straight through instead.
    const error = Object.assign(new Error("Unique constraint failed"), {
      code: "P2002",
      meta: { target: "app_users_email_key" },
    });
    expect(isEmailInUse(error)).toBe(true);
  });

  it("recognises the raw Postgres code with a constraint name", () => {
    // What reaches the caller when a failure does not go through Prisma's P2002 translation: the
    // driver names the constraint on `.constraint`, and there is no `.meta` at all.
    const error = Object.assign(new Error("duplicate key value violates unique constraint"), {
      code: "23505",
      constraint: "app_users_email_key",
    });
    expect(isEmailInUse(error)).toBe(true);
  });

  it("recognises the raw Postgres code from the detail sentence when there is no constraint name", () => {
    const error = Object.assign(new Error("duplicate key value violates unique constraint"), {
      code: "23505",
      detail: "Key (email)=(persona@empresa.co) already exists.",
    });
    expect(isEmailInUse(error)).toBe(true);
  });

  it("does not treat a raw Postgres violation on another column as an email clash", () => {
    const error = Object.assign(new Error("duplicate key value violates unique constraint"), {
      code: "23505",
      constraint: "user_sessions_token_hash_key",
      detail: "Key (token_hash)=(abc123) already exists.",
    });
    expect(isEmailInUse(error)).toBe(false);
  });

  it("returns false for anything else", () => {
    expect(isEmailInUse(new Error("boom"))).toBe(false);
    expect(isEmailInUse(null)).toBe(false);
  });
});
