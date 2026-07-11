import { requireAdmin } from "@/lib/auth/server";
import { PreviewScreen } from "@/features/preview";

// The same read-only preview a company user gets, pointed at another company. One
// implementation, two routes, mirroring the dashboard and data-entry drill-downs.
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string }>;
  searchParams: Promise<{ facilityId?: string; year?: string }>;
}) {
  await requireAdmin();
  const { companyId } = await params;

  return (
    <PreviewScreen
      companyId={companyId}
      basePath={`/admin/companies/${companyId}/preview`}
      searchParams={await searchParams}
    />
  );
}
