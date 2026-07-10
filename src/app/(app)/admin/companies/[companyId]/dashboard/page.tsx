import { requireAdmin } from "@/lib/auth/server";
import { DashboardScreen } from "@/features/dashboard";

export default async function Page({ params }: { params: Promise<{ companyId: string }> }) {
  await requireAdmin();
  const { companyId } = await params;

  return <DashboardScreen companyId={companyId} />;
}
