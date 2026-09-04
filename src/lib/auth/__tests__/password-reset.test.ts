import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashToken } from "@/lib/auth/session";

// This is the one place a password reset token gets minted, shared by requestPasswordResetAction
// and createUser's welcome mail so a fix to token issuing cannot land in only one of them. What
// is worth pinning here, against an in-memory stand-in for the single Prisma write it makes: that
// only the digest is stored, that the plaintext is returned so a caller can put it in a link, and
// that the expiry matches the documented lifetime.

type Row = { id: string; userId: string; tokenHash: string; expiresAt: Date; createdAt: Date; consumedAt: Date | null };

const rows = new Map<string, Row>();
let nextId = 1;

const passwordResetToken = {
  create: async ({ data }: { data: Omit<Row, "id" | "createdAt" | "consumedAt"> }) => {
    const row: Row = { id: `reset-${nextId++}`, createdAt: new Date(), consumedAt: null, ...data };
    rows.set(row.id, row);
    return row;
  },
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    get passwordResetToken() {
      return passwordResetToken;
    },
  },
}));

const { RESET_TTL_MINUTES, issuePasswordResetToken } = await import("../password-reset");

beforeEach(() => {
  rows.clear();
  nextId = 1;
});

describe("issuePasswordResetToken", () => {
  it("writes a row carrying the digest, never the plaintext", async () => {
    const { token } = await issuePasswordResetToken("user-1");

    const [row] = [...rows.values()];
    expect(row!.userId).toBe("user-1");
    expect(row!.tokenHash).toBe(hashToken(token));
    expect(row!.tokenHash).not.toBe(token);
    expect(JSON.stringify([...rows.values()])).not.toContain(token);
  });

  it("returns the documented lifetime alongside the token", async () => {
    const before = Date.now();
    const { expiresInMinutes } = await issuePasswordResetToken("user-1");

    expect(expiresInMinutes).toBe(RESET_TTL_MINUTES);
    const [row] = [...rows.values()];
    const minutes = (row!.expiresAt.getTime() - before) / 60_000;
    expect(minutes).toBeGreaterThan(RESET_TTL_MINUTES - 1);
    expect(minutes).toBeLessThanOrEqual(RESET_TTL_MINUTES + 0.01);
  });

  it("hands out a different token every time", async () => {
    const first = await issuePasswordResetToken("user-1");
    const second = await issuePasswordResetToken("user-1");
    expect(first.token).not.toBe(second.token);
    expect(rows.size).toBe(2);
  });
});
