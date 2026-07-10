import {
  Building2,
  ClipboardList,
  FileText,
  LayoutDashboard,
  Library,
  MapPin,
  Users,
  type LucideIcon,
} from "lucide-react";

export type NavLeaf = {
  key: string; // i18n key under "nav"
  segment: string; // relative segment, or an absolute path when it starts with "/"
  icon: LucideIcon;
  comingSoon?: boolean;
};

// The company workspace. A company user sees it at the root; an admin sees the same
// items nested under /admin/companies/[companyId]. The sidebar prepends the base.
export const WORKSPACE_ITEMS: NavLeaf[] = [
  { key: "dashboard", segment: "dashboard", icon: LayoutDashboard },
  { key: "dataEntry", segment: "data-entry", icon: ClipboardList },
  { key: "facilities", segment: "facilities", icon: MapPin },
  { key: "reports", segment: "reports", icon: FileText, comingSoon: true },
];

// CECODES admin only. Absolute paths.
export const ADMIN_ITEMS: NavLeaf[] = [
  { key: "companies", segment: "/admin/companies", icon: Building2 },
  { key: "users", segment: "/admin/users", icon: Users },
  { key: "factorLibrary", segment: "/admin/factors", icon: Library, comingSoon: true },
];

export function navHref(base: string, item: NavLeaf): string {
  return item.segment.startsWith("/") ? item.segment : `${base}/${item.segment}`;
}
