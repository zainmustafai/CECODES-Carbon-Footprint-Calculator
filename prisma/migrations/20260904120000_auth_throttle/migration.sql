-- Sign-in throttling. See prisma/schema.prisma (model AuthThrottle) for why the key is a plain
-- string and not a reference to app_users, and src/lib/auth/throttle-policy.ts for the windows.

-- CreateTable
CREATE TABLE "auth_throttle" (
    "key" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "windowStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedUntil" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_throttle_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "auth_throttle_updatedAt_idx" ON "auth_throttle"("updatedAt");

-- RLS: inert through Prisma, which connects as the table owner (IMPLEMENTATION.md section 8).
-- Unlike the tenant tables this one gets NO policies at all, which is the point: the table holds
-- unauthenticated sign-in attempts keyed by email address, so a signed-in user reading it would
-- learn which addresses have accounts and which are currently locked out. Enabled with no policy
-- means every non-owner role is denied, which is the correct answer for all of them.
ALTER TABLE public.auth_throttle ENABLE ROW LEVEL SECURITY;
