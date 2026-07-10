import { requireAdmin } from "@/lib/auth/server";
import { DataEntryScreen } from "@/features/data-entry";

// The same screen a company user gets at /data-entry, pointed at another company. One
// implementation, two routes: this is how an admin works on behalf of a company.
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
    <DataEntryScreen
      companyId={companyId}
      basePath={`/admin/companies/${companyId}/data-entry`}
      searchParams={await searchParams}
    />
  );
}
