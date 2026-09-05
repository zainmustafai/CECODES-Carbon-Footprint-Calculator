import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { requireAppUser } from "@/lib/auth/server";
import { prisma } from "@/lib/prisma";
import { AppSidebar, AppTopbar } from "@/features/app-shell";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const t = await getTranslations("nav");
  const appUser = await requireAppUser();
  const role = appUser?.role ?? "COMPANY_USER";

  const company =
    appUser?.companyId ?
      await prisma.company.findUnique({
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
        className="sr-only focus:not-sr-only focus:top-2 focus:left-2 focus:z-50 focus:fixed focus:bg-primary focus:px-3 focus:py-2 focus:rounded-md focus:text-primary-foreground"
      >
        {t("skipToContent")}
      </a>
      <AppSidebar role={role} companyName={company?.name ?? null} />
      {/* min-w-0 is load-bearing: SidebarInset is a flex item, and a flex item's default
          min-width:auto refuses to shrink below its content. Without it, any wide child (a data
          table, a chart legend) widens the whole page instead of scrolling inside its own
          overflow-x-auto container, and the entire dashboard gains a horizontal scrollbar. */}
      <SidebarInset className="min-w-0">
        <AppTopbar
          email={appUser?.email}
          role={role}
          companyName={company?.name ?? null}
        />
        {/* Horizontal padding only. The vertical padding is gone on purpose: the topbar above is
            sticky and translucent, and a top gap would park an empty band under it instead of
            letting content scroll through the blur. */}
        <div
          id="main-content"
          tabIndex={-1}
          className="flex-1 p-6 lg:px-8 min-w-0"
        >
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
