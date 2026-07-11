import { redirect } from "next/navigation";
import { companyIsActive, requireAppUser } from "@/lib/auth/server";
import { FacilitiesScreen } from "@/features/facilities";
import { CompanyInactiveScreen } from "@/features/app-shell";

export default async function Page() {
  const appUser = await requireAppUser();
  if (!appUser) redirect("/onboarding");
  if (appUser.role === "CECODES_ADMIN") redirect("/admin/companies");
  if (!appUser.companyId) redirect("/onboarding");
  if (!(await companyIsActive(appUser.companyId))) return <CompanyInactiveScreen />;

  return <FacilitiesScreen companyId={appUser.companyId} basePath="/facilities" />;
}
