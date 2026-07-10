import { requireAdmin } from "@/lib/auth/server";
import { FacilitiesScreen } from "@/features/facilities";

export default async function Page({ params }: { params: Promise<{ companyId: string }> }) {
  await requireAdmin();
  const { companyId } = await params;

  return (
    <FacilitiesScreen
      companyId={companyId}
      basePath={`/admin/companies/${companyId}/facilities`}
    />
  );
}
