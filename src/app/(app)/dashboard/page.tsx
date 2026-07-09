import { redirect } from "next/navigation";
import { requireAppUser } from "@/lib/auth/server";
import { DashboardScreen } from "@/features/dashboard";

export default async function Page() {
  const appUser = await requireAppUser();
  // Authenticated but no profile row yet, or a company user without a company:
  // send them to onboarding (which self-heals). Admins may have no company.
  if (!appUser) redirect("/onboarding");
  if (!appUser.companyId && appUser.role !== "CECODES_ADMIN") redirect("/onboarding");

  return <DashboardScreen email={appUser.email} companyId={appUser.companyId} />;
}
