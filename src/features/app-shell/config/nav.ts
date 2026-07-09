import {
  ClipboardList,
  FileText,
  LayoutDashboard,
  Library,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  key: string; // i18n key under "nav"
  href: string;
  icon: LucideIcon;
  comingSoon?: boolean;
  adminOnly?: boolean;
};

export const NAV_ITEMS: NavItem[] = [
  { key: "dashboard", href: "/dashboard", icon: LayoutDashboard },
  { key: "dataEntry", href: "/data-entry", icon: ClipboardList, comingSoon: true },
  { key: "reports", href: "/reports", icon: FileText, comingSoon: true },
  {
    key: "factorLibrary",
    href: "/admin/factors",
    icon: Library,
    comingSoon: true,
    adminOnly: true,
  },
];
