"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/server";

// Server-side validation (do not trust the client resolver).
const serverSchema = z.object({
  companyName: z.string().trim().min(1),
  sector: z.string().trim().optional(),
  facilityName: z.string().trim().min(1),
  facilityLocation: z.string().trim().min(1),
});

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
export async function createCompanyAction(input: {
  companyName: string;
  sector?: string;
  facilityName: string;
  facilityLocation: string;
}): Promise<{ error?: string }> {
  const user = await requireUser();

  const parsed = serverSchema.safeParse(input);
  if (!parsed.success) return { error: "generic" };
  const { companyName, sector, facilityName, facilityLocation } = parsed.data;

  // Fast path for the common "already has a company" case.
  const existing = await prisma.appUser.findUnique({ where: { id: user.id } });
  if (existing?.companyId) return { error: "alreadyOnboarded" };

  try {
    await prisma.$transaction(async (tx) => {
      // Self-heal a missing profile row (normally created by the signup trigger).
      await tx.appUser.upsert({
        where: { id: user.id },
        update: {},
        create: { id: user.id, email: user.email ?? "", role: "COMPANY_USER" },
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

      // Atomically claim the link: only succeeds while still unlinked. On a race
      // the losing transaction gets count 0 and rolls back (no orphaned company).
      const claimed = await tx.appUser.updateMany({
        where: { id: user.id, companyId: null },
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
