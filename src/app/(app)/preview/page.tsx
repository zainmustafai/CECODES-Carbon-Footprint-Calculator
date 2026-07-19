import { redirect } from "next/navigation";
import { companyIsActive, requireAppUser } from "@/lib/auth/server";
import { PreviewScreen } from "@/features/preview";
import { CompanyInactiveScreen } from "@/features/app-shell";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ facilityId?: string; year?: string }>;
}) {
  const appUser = await requireAppUser();
  if (!appUser) redirect("/onboarding");
  // An admin has no company of their own. They preview through /admin/companies/[id].
  if (appUser.role === "CECODES_ADMIN") redirect("/admin");
  if (!appUser.companyId) redirect("/onboarding");
  if (!(await companyIsActive(appUser.companyId))) return <CompanyInactiveScreen />;

  return (
    <PreviewScreen
      companyId={appUser.companyId}
      basePath="/preview"
      searchParams={await searchParams}
    />
  );
}
