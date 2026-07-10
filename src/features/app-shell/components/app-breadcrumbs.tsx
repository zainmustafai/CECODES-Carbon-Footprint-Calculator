"use client";

import { Fragment } from "react";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Skeleton } from "@/components/ui/skeleton";
import { useCompanyName } from "../hooks/use-company-name";

// URL segment to i18n key under "nav".
const SEGMENT_KEYS: Record<string, string> = {
  dashboard: "dashboard",
  "data-entry": "dataEntry",
  facilities: "facilities",
  reports: "reports",
  companies: "companies",
  users: "users",
  factors: "factorLibrary",
  onboarding: "onboarding",
};

type Crumb = { label: string | null; href?: string };

export function AppBreadcrumbs() {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const params = useParams<{ companyId?: string }>();
  const companyId = params?.companyId ?? null;
  const companyName = useCompanyName(companyId);

  const segments = pathname.split("/").filter(Boolean);
  const crumbs: Crumb[] = [];

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    if (segment === "admin") continue; // a route grouping, never a destination

    if (companyId && segment === companyId) {
      crumbs.push({ label: companyName, href: `/admin/companies/${companyId}/dashboard` });
      continue;
    }

    const key = SEGMENT_KEYS[segment];
    if (!key) continue;
    crumbs.push({ label: t(key), href: `/${segments.slice(0, i + 1).join("/")}` });
  }

  if (crumbs.length === 0) return null;

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {crumbs.map((crumb, index) => {
          const isLast = index === crumbs.length - 1;
          const content =
            crumb.label === null ? <Skeleton className="h-4 w-24" /> : crumb.label;

          // Intermediate crumbs hide below md so a deep admin trail never wraps the topbar.
          return (
            <Fragment key={`${crumb.href}-${index}`}>
              <BreadcrumbItem className={isLast ? undefined : "hidden md:block"}>
                {isLast ? (
                  <BreadcrumbPage className="truncate">{content}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link href={crumb.href ?? "#"}>{content}</Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {isLast ? null : <BreadcrumbSeparator className="hidden md:block" />}
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
