import { requireAdmin } from "@/lib/auth/server";
import { FactorDetailScreen } from "@/features/admin/components/factor-detail-screen";

export default async function Page({
  params,
}: {
  params: Promise<{ factorId: string }>;
}) {
  await requireAdmin();
  const { factorId } = await params;
  return <FactorDetailScreen factorId={factorId} />;
}
