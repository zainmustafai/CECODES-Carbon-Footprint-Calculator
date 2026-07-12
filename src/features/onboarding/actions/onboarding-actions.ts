"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { resolveOnboardingScope, scopeErrorKey } from "@/lib/auth/company-scope";

// Server-side validation (do not trust the client resolver). .strict() so an unknown key
// cannot ride into the write.
const serverSchema = z
  .object({
    companyName: z.string().trim().min(1).max(160),
    sector: z.string().trim().max(160).optional(),
    facilityName: z.string().trim().min(1).max(160),
    facilityLocation: z.string().trim().min(1).max(160),
  })
  .strict();

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}

// Creates the user's company plus its first facility, and links the user to it.
// Returns an i18n error key on failure. Server-only (no Supabase/DB from the browser).
//
// This is a public POST endpoint that runs no layout, so it authorizes itself through
// resolveOnboardingScope. It previously called requireUser(), which validates the Supabase
// session but never reads app_users.active: a deactivated user who had never been onboarded
// could create a company and link themselves to it.
export async function createCompanyAction(input: {
  companyName: string;
  sector?: string;
  facilityName: string;
  facilityLocation: string;
}): Promise<{ error?: string }> {
  const parsed = serverSchema.safeParse(input);
  if (!parsed.success) return { error: "generic" };
  const { companyName, sector, facilityName, facilityLocation } = parsed.data;

  let userId: string;
  let email: string;
  try {
    const scope = await resolveOnboardingScope();
    // Fast path for the common "already has a company" case.
    if (scope.appUser?.companyId) return { error: "alreadyOnboarded" };
    userId = scope.userId;
    email = scope.email;
  } catch (error) {
    return { error: scopeErrorKey(error) };
  }

  try {
    await prisma.$transaction(async (tx) => {
      // Self-heal a missing profile row (normally created by the signup trigger).
      await tx.appUser.upsert({
        where: { id: userId },
        update: {},
        create: { id: userId, email, role: "COMPANY_USER" },
      });

      const company = await tx.company.create({
        data: {
          name: companyName,
          sector: sector || null,
          facilities: {
            create: { name: facilityName, location: facilityLocation },
          },
        },
      });

      // Atomically claim the link: only succeeds while still unlinked AND still active. On a
      // race the losing transaction gets count 0 and rolls back (no orphaned company).
      const claimed = await tx.appUser.updateMany({
        where: { id: userId, companyId: null, active: true },
        data: { companyId: company.id },
      });
      if (claimed.count !== 1) throw new Error("already-linked");
    });
  } catch (error) {
    // The [companyId, name] unique index. Reporting it as "generic" told the user nothing,
    // and the field they need to change is right in front of them.
    if (isUniqueViolation(error)) return { error: "facilityExists" };
    return { error: "generic" };
  }

  return {};
}
