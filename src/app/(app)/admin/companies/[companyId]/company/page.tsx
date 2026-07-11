import { requireAdmin } from "@/lib/auth/server";
import { CompanyProfileScreen } from "@/features/company";

// The same screen the company user sees, scoped by the URL instead of the session.
// requireAdmin() guards the rendering; updateCompanyProfile re-authorizes on write.
export default async function Page({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  await requireAdmin();
  const { companyId } = await params;

  return (
    <CompanyProfileScreen
      companyId={companyId}
      basePath={`/admin/companies/${companyId}/company`}
    />
  );
}
