import { requireAppUser } from "@/lib/auth/server";
import { AppSidebar, AppTopbar } from "@/features/app-shell";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const appUser = await requireAppUser();
  const role = appUser?.role ?? "COMPANY_USER";

  return (
    <div className="flex min-h-screen">
      <AppSidebar role={role} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppTopbar email={appUser?.email} role={role} />
        <main className="flex-1 p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
