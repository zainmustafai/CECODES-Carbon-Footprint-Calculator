"use client";

import Link from "next/link";
import { Building2, LogOut } from "lucide-react";
import { useTranslations } from "next-intl";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLogout } from "@/features/auth/client";

type UserMenuProps = {
  email?: string;
  role: string;
  companyName?: string | null;
};

export function UserMenu({ email, role, companyName }: UserMenuProps) {
  const t = useTranslations("nav");
  const { logout, isPending } = useLogout();
  const initials = (email?.trim()?.[0] ?? "?").toUpperCase();
  const isAdmin = role === "CECODES_ADMIN";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="rounded-full" aria-label={t("account")}>
          <Avatar className="size-8">
            <AvatarFallback className="bg-primary/10 text-xs text-primary">
              {initials}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="font-normal">
          <div className="grid gap-1.5">
            <span className="truncate text-sm font-medium">{email}</span>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="w-fit">
                {isAdmin ? t("roleBadge.admin") : t("roleBadge.company")}
              </Badge>
            </div>
            {companyName ? (
              <span className="truncate text-xs text-muted-foreground">{companyName}</span>
            ) : null}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href={isAdmin ? "/admin/companies" : "/facilities"}>
            <Building2 className="size-4" aria-hidden />
            {isAdmin ? t("companies") : t("myCompany")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={isPending} onSelect={() => logout()}>
          <LogOut className="size-4" aria-hidden />
          {t("signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
