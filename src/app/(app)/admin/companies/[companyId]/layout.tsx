import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/server";
import { prisma } from "@/lib/prisma";

// Fails fast on a companyId that does not exist, so every page beneath can assume it does.
export default async function AdminCompanyLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ companyId: string }>;
}) {
  await requireAdmin();
  const { companyId } = await params;

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true },
  });
  if (!company) notFound();

  return children;
}
