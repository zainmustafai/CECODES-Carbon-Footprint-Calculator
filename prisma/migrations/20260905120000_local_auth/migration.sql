-- Self-hosted authentication: credentials and sessions move into this database.
--
-- Purely additive. Every added column is nullable and both tables are new, so this migration
-- changes no existing row and no existing behaviour. Nothing here reads or writes auth.users;
-- the data is carried across afterwards by prisma/backfill-auth-credentials.ts, which is
-- idempotent and never overwrites a hash that is already set.
--
-- See prisma/schema.prisma (AppUser, UserSession, PasswordResetToken) for why the session token
-- is opaque and server-side rather than a JWT.

-- AlterTable
ALTER TABLE "app_users" ADD COLUMN     "emailConfirmedAt" TIMESTAMP(3),
ADD COLUMN     "lastSignInAt" TIMESTAMP(3),
ADD COLUMN     "passwordAlgo" TEXT,
ADD COLUMN     "passwordHash" TEXT;

-- CreateTable
CREATE TABLE "user_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- Plain UNIQUE on the hash, deliberately not a partial unique index on unconsumed tokens:
-- NULLs are distinct in a Postgres unique index (IMPLEMENTATION.md section 11), so a partial
-- index keyed on consumedAt IS NULL would silently permit duplicates rather than prevent them.
CREATE UNIQUE INDEX "user_sessions_tokenHash_key" ON "user_sessions"("tokenHash");

-- CreateIndex
CREATE INDEX "user_sessions_userId_idx" ON "user_sessions"("userId");

-- CreateIndex
CREATE INDEX "user_sessions_expiresAt_idx" ON "user_sessions"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_tokenHash_key" ON "password_reset_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "password_reset_tokens_userId_idx" ON "password_reset_tokens"("userId");

-- CreateIndex
CREATE INDEX "password_reset_tokens_expiresAt_idx" ON "password_reset_tokens"("expiresAt");

-- AddForeignKey
-- ON DELETE CASCADE: deleting a user must take their sessions and reset links with it. This is
-- the by-user revocation supabase-js could not offer (see user-actions.ts, setUserActive).
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "app_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "app_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS: enabled with NO policies, exactly as auth_throttle does and for the same reason. These
-- tables hold session and reset material, so deny-all for every non-owner role is the correct
-- answer for all of them. Inert through Prisma, which connects as the table owner
-- (IMPLEMENTATION.md section 8), but correct the moment any other access path exists.
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.password_reset_tokens ENABLE ROW LEVEL SECURITY;
