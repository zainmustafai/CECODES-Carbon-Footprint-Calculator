import { redirect } from "next/navigation";
import { requireAppUser } from "@/lib/auth/server";
import { FacilitiesScreen } from "@/features/facilities";

export default async function Page() {
  const appUser = await requireAppUser();
  if (!appUser) redirect("/onboarding");
  if (appUser.role === "CECODES_ADMIN") redirect("/admin/companies");
  if (!appUser.companyId) redirect("/onboarding");

  return <FacilitiesScreen companyId={appUser.companyId} basePath="/facilities" />;
}
