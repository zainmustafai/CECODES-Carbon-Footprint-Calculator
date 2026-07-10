import { redirect } from "next/navigation";
import { requireAppUser } from "@/lib/auth/server";
import { DataEntryScreen } from "@/features/data-entry";

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

  return (
    <DataEntryScreen
      companyId={appUser.companyId}
      basePath="/data-entry"
      searchParams={await searchParams}
    />
  );
}
