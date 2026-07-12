import { requireAdmin } from "@/lib/auth/server";
import { DashboardScreen } from "@/features/dashboard";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string }>;
  searchParams: Promise<{ facilityId?: string; year?: string; scope?: string; category?: string }>;
}) {
  await requireAdmin();
  const { companyId } = await params;

  return (
    <DashboardScreen
      companyId={companyId}
      basePath={`/admin/companies/${companyId}/dashboard`}
      searchParams={await searchParams}
    />
  );
}
