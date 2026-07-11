import { requireAdmin } from "@/lib/auth/server";
import { CompanyScreen } from "@/features/company";

// The same screen the company user sees, scoped by the URL instead of the session.
// requireAdmin() guards the rendering; every write action re-authorizes on its own.
export default async function Page({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  await requireAdmin();
  const { companyId } = await params;

  return (
    <CompanyScreen
      companyId={companyId}
      basePath={`/admin/companies/${companyId}/company`}
    />
  );
}
