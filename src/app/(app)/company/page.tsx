import { redirect } from "next/navigation";
import { companyIsActive, requireAppUser } from "@/lib/auth/server";
import { CompanyProfileScreen } from "@/features/company";
import { CompanyInactiveScreen } from "@/features/app-shell";

export default async function Page() {
  const appUser = await requireAppUser();
  if (!appUser) redirect("/onboarding");
  // An admin has no company of their own. They edit a profile through the drill-down.
  if (appUser.role === "CECODES_ADMIN") redirect("/admin/companies");
  if (!appUser.companyId) redirect("/onboarding");
  if (!(await companyIsActive(appUser.companyId))) return <CompanyInactiveScreen />;

  return <CompanyProfileScreen companyId={appUser.companyId} basePath="/company" />;
}
