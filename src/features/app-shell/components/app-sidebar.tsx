"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
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
import {
  ADMIN_ITEMS,
  WORKSPACE_ITEMS,
  navHref,
  type NavLeaf,
} from "../config/nav";

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

export function AppSidebar({ role }: AppSidebarProps) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const params = useParams<{ companyId?: string }>();
  const { setOpenMobile, isMobile, state } = useSidebar();

  const isAdmin = role === "CECODES_ADMIN";
  const drilledCompanyId = isAdmin ? (params?.companyId ?? null) : null;

  const close = () => setOpenMobile(false);

  function renderLeaf(item: NavLeaf, base: string) {
    const href = navHref(base, item);
    const label = t(item.key);

    if (item.comingSoon) {
      return (
        <SidebarMenuItem key={item.key}>
          <SidebarMenuButton
            aria-disabled
            tooltip={label}
            className="cursor-default"
          >
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
        <SidebarMenuButton
          asChild
          isActive={active}
          tooltip={label}
          className={ACTIVE}
        >
          <Link
            href={href}
            aria-current={active ? "page" : undefined}
            onClick={close}
          >
            <item.icon aria-hidden />
            <span>{label}</span>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  }

  const useSquareLogo = !isMobile && state === "collapsed";

  return (
    <Sidebar variant="inset" collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              asChild
              className="bg-white hover:bg-white active:bg-white/90 h-20 min-h-max"
            >
              <Link
                href={isAdmin ? "/admin/companies" : "/dashboard"}
                onClick={close}
                className="flex flex-col items-stretch"
              >
                {/* The logo is a wide navy lockup; the icon sits in its leftmost square,
                    so an object-left cover crop yields the brand mark. The white chip is
                    required: navy on the forest-green sidebar has no contrast. */}
                {useSquareLogo ?
                  <Image
                    src="/logo-square.png"
                    width={30}
                    height={30}
                    alt="Logo"
                    aria-hidden
                    className="size-full object-cover object-left scale-80"
                  />
                : <Image
                    src="/logo.png"
                    alt=""
                    aria-hidden
                    width={200}
                    height={200}
                    className="mx-auto"
                  />
                }
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {isAdmin ?
          <SidebarGroup>
            <SidebarGroupLabel>{t("administration")}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {ADMIN_ITEMS.map((item) => {
                  const isCompanies = item.key === "companies";
                  if (!isCompanies || !drilledCompanyId)
                    return renderLeaf(item, "");

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
                                  className="text-sidebar-foreground/60 cursor-default"
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
        : <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {WORKSPACE_ITEMS.map((item) => renderLeaf(item, ""))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        }
      </SidebarContent>

      <SidebarFooter>
        {/* /70, not /50: at /50 this 12px text lands at 4.19:1 on the sidebar green, under
            AA. /70 matches the group labels, which pass. */}
        <p className="group-data-[collapsible=icon]:hidden px-2 pb-1 text-sidebar-foreground/70 text-xs">
          {t("platformVersion")}
        </p>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
