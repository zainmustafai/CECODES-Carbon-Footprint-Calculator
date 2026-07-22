import { redirect } from "next/navigation";
import { companyIsActive, requireAppUser } from "@/lib/auth/server";
import { DashboardScreen } from "@/features/dashboard";
import { CompanyInactiveScreen } from "@/features/app-shell";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    facilityId?: string;
    year?: string;
    scope?: string;
    category?: string;
  }>;
}) {
  const appUser = await requireAppUser();
  if (!appUser) redirect("/onboarding");
  // An admin has no company, so this dashboard would render nothing but an empty state.
  // Their home is the admin overview.
  if (appUser.role === "CECODES_ADMIN") redirect("/admin");
  if (!appUser.companyId) redirect("/onboarding");
  if (!(await companyIsActive(appUser.companyId)))
    return <CompanyInactiveScreen />;

  return (
    <DashboardScreen
      companyId={appUser.companyId}
      basePath="/dashboard"
      searchParams={await searchParams}
    />
  );
}
