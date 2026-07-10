"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Leaf } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { useCompanyName } from "../hooks/use-company-name";
import { ADMIN_ITEMS, WORKSPACE_ITEMS, navHref, type NavLeaf } from "../config/nav";

// The block's own data-active styles (bg-sidebar-accent + accent-foreground) read well on
// green. We add a bright-green indicator bar and icon so active out-ranks hover without
// putting 14px text on a bright-green fill, which would fail AA contrast.
const ACTIVE =
  "data-active:shadow-[inset_2px_0_0_var(--sidebar-primary)] data-active:[&_svg]:text-sidebar-primary";

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

type AppSidebarProps = {
  role: string;
  companyName?: string | null;
};

export function AppSidebar({ role, companyName }: AppSidebarProps) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const params = useParams<{ companyId?: string }>();
  const { setOpenMobile } = useSidebar();

  const isAdmin = role === "CECODES_ADMIN";
  const drilledCompanyId = isAdmin ? (params?.companyId ?? null) : null;
  const drilledCompanyName = useCompanyName(drilledCompanyId);

  const close = () => setOpenMobile(false);

  const subtitle = isAdmin
    ? (drilledCompanyName ?? t("administration"))
    : (companyName ?? t("workspace"));

  function renderLeaf(item: NavLeaf, base: string) {
    const href = navHref(base, item);
    const label = t(item.key);

    if (item.comingSoon) {
      return (
        <SidebarMenuItem key={item.key}>
          <SidebarMenuButton aria-disabled tooltip={label} className="cursor-default">
            <item.icon aria-hidden />
            <span>{label}</span>
          </SidebarMenuButton>
          <SidebarMenuBadge>{t("comingSoon")}</SidebarMenuBadge>
        </SidebarMenuItem>
      );
    }

    const active = isActive(pathname, href);
    return (
      <SidebarMenuItem key={item.key}>
        <SidebarMenuButton asChild isActive={active} tooltip={label} className={ACTIVE}>
          <Link href={href} aria-current={active ? "page" : undefined} onClick={close}>
            <item.icon aria-hidden />
            <span>{label}</span>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  }

  return (
    <Sidebar variant="inset" collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href={isAdmin ? "/admin/companies" : "/dashboard"} onClick={close}>
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                  <Leaf className="size-4" aria-hidden />
                </div>
                <div className="grid flex-1 text-left leading-tight">
                  <span className="truncate text-sm font-semibold">CECODES</span>
                  {isAdmin && drilledCompanyId && !drilledCompanyName ? (
                    <Skeleton className="mt-1 h-3 w-24 bg-sidebar-accent" />
                  ) : (
                    <span className="truncate text-xs text-sidebar-foreground/70">
                      {subtitle}
                    </span>
                  )}
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {isAdmin ? (
          <SidebarGroup>
            <SidebarGroupLabel>{t("administration")}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {ADMIN_ITEMS.map((item) => {
                  const isCompanies = item.key === "companies";
                  if (!isCompanies || !drilledCompanyId) return renderLeaf(item, "");

                  // Drilled into a company: "Empresas" stays the way back, and the company
                  // workspace nests beneath it.
                  const base = `/admin/companies/${drilledCompanyId}`;
                  return (
                    <SidebarMenuItem key={item.key}>
                      <SidebarMenuButton
                        asChild
                        isActive={pathname === "/admin/companies"}
                        tooltip={t(item.key)}
                        className={ACTIVE}
                      >
                        <Link href="/admin/companies" onClick={close}>
                          <item.icon aria-hidden />
                          <span>{t(item.key)}</span>
                        </Link>
                      </SidebarMenuButton>
                      <SidebarMenuSub>
                        {WORKSPACE_ITEMS.map((sub) => {
                          const href = navHref(base, sub);
                          const label = t(sub.key);
                          if (sub.comingSoon) {
                            return (
                              <SidebarMenuSubItem key={sub.key}>
                                <SidebarMenuSubButton
                                  aria-disabled
                                  className="cursor-default text-sidebar-foreground/60"
                                >
                                  <sub.icon aria-hidden />
                                  <span>{label}</span>
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                            );
                          }
                          const active = isActive(pathname, href);
                          return (
                            <SidebarMenuSubItem key={sub.key}>
                              <SidebarMenuSubButton asChild isActive={active}>
                                <Link
                                  href={href}
                                  aria-current={active ? "page" : undefined}
                                  onClick={close}
                                >
                                  <sub.icon aria-hidden />
                                  <span>{label}</span>
                                </Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          );
                        })}
                      </SidebarMenuSub>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : (
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {WORKSPACE_ITEMS.map((item) => renderLeaf(item, ""))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter>
        <p className="px-2 pb-1 text-xs text-sidebar-foreground/50 group-data-[collapsible=icon]:hidden">
          {t("platformVersion")}
        </p>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
