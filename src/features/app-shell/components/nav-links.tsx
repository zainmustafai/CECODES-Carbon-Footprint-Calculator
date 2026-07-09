"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "../config/nav";

export function NavLinks({
  role,
  onNavigate,
}: {
  role: string;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const t = useTranslations("nav");
  const items = NAV_ITEMS.filter((i) => !i.adminOnly || role === "CECODES_ADMIN");

  return (
    <div className="space-y-1">
      {items.map((item) => {
        const Icon = item.icon;

        if (item.comingSoon) {
          return (
            <div
              key={item.key}
              className="flex items-center justify-between gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground"
            >
              <span className="flex items-center gap-3">
                <Icon className="size-4" />
                {t(item.key)}
              </span>
              <Badge variant="outline" className="text-[10px] font-normal">
                {t("comingSoon")}
              </Badge>
            </div>
          );
        }

        const active =
          pathname === item.href || pathname.startsWith(`${item.href}/`);

        return (
          <Link
            key={item.key}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-primary/10 text-primary"
                : "text-foreground/70 hover:bg-accent hover:text-accent-foreground",
            )}
          >
            <Icon className="size-4" />
            {t(item.key)}
          </Link>
        );
      })}
    </div>
  );
}
