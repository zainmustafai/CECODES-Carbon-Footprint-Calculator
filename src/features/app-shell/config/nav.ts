import {
  Building,
  Building2,
  ClipboardList,
  FileText,
  History,
  LayoutDashboard,
  Library,
  Table2,
  Users,
  type LucideIcon,
} from "lucide-react";

export type NavLeaf = {
  key: string; // i18n key under "nav"
  segment: string; // relative segment, or an absolute path when it starts with "/"
  icon: LucideIcon;
  comingSoon?: boolean;
  // Match the active state on an exact path only. "/admin" (the home) is a prefix of every other
  // admin route, so without this it would light up on all of them.
  exact?: boolean;
};

// The company workspace. A company user sees it at the root; an admin sees the same
// items nested under /admin/companies/[companyId]. The sidebar prepends the base.
export const WORKSPACE_ITEMS: NavLeaf[] = [
  { key: "dashboard", segment: "dashboard", icon: LayoutDashboard },
  { key: "dataEntry", segment: "data-entry", icon: ClipboardList },
  { key: "preview", segment: "preview", icon: Table2 },
  // Sedes (facilities) is managed inside the company page now, not as its own item.
  { key: "company", segment: "company", icon: Building },
  { key: "reports", segment: "reports", icon: FileText, comingSoon: true },
];

// CECODES admin only. Absolute paths.
export const ADMIN_ITEMS: NavLeaf[] = [
  { key: "home", segment: "/admin", icon: LayoutDashboard, exact: true },
  { key: "companies", segment: "/admin/companies", icon: Building2 },
  { key: "users", segment: "/admin/users", icon: Users },
  { key: "factorLibrary", segment: "/admin/factors", icon: Library },
  { key: "traceability", segment: "/admin/traceability", icon: History },
];

export function navHref(base: string, item: NavLeaf): string {
  return item.segment.startsWith("/") ? item.segment : `${base}/${item.segment}`;
}
