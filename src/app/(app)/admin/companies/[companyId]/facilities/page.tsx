import { redirect } from "next/navigation";

// Sedes management folded into the company drill-down page; this route stays as a permanent
// redirect so old bookmarks and in-app links keep working.
export default async function Page({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = await params;
  redirect(`/admin/companies/${companyId}/company`);
}
