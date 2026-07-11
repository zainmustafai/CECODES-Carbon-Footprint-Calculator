"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useLogout } from "../hooks/use-logout";

export function SignOutButton() {
  const t = useTranslations("nav");
  const { logout, isPending } = useLogout();

  return (
    <Button variant="outline" size="sm" onClick={logout} loading={isPending}>
      {t("signOut")}
    </Button>
  );
}
