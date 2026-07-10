import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { requireAppUser } from "@/lib/auth/server";
import { prisma } from "@/lib/prisma";
import { AppSidebar, AppTopbar } from "@/features/app-shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations("nav");
  const appUser = await requireAppUser();
  const role = appUser?.role ?? "COMPANY_USER";

  const company = appUser?.companyId
    ? await prisma.company.findUnique({
        where: { id: appUser.companyId },
        select: { name: true },
      })
    : null;

  // The block persists the expanded/collapsed state here. Reading it server-side avoids a
  // first-paint flash of the wrong width.
  const cookieStore = await cookies();
  const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false";

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground"
      >
        {t("skipToContent")}
      </a>
      <AppSidebar role={role} companyName={company?.name ?? null} />
      <SidebarInset>
        <AppTopbar email={appUser?.email} role={role} companyName={company?.name ?? null} />
        <div id="main-content" tabIndex={-1} className="flex-1 p-6 lg:p-8">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
