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

  it("returns false for anything else", () => {
    expect(isEmailInUse(new Error("boom"))).toBe(false);
    expect(isEmailInUse(null)).toBe(false);
  });
});
