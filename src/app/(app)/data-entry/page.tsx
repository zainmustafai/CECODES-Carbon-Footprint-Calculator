import { redirect } from "next/navigation";
import { companyIsActive, requireAppUser } from "@/lib/auth/server";
import { DataEntryScreen } from "@/features/data-entry";
import { CompanyInactiveScreen } from "@/features/app-shell";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ facilityId?: string; year?: string }>;
}) {
  const appUser = await requireAppUser();
  if (!appUser) redirect("/onboarding");
  // An admin has no company of their own. They enter data through /admin/companies/[id].
  if (appUser.role === "CECODES_ADMIN") redirect("/admin/companies");
  if (!appUser.companyId) redirect("/onboarding");
  if (!(await companyIsActive(appUser.companyId))) return <CompanyInactiveScreen />;

  return (
    <DataEntryScreen
      companyId={appUser.companyId}
      basePath="/data-entry"
      searchParams={await searchParams}
    />
  );
}
