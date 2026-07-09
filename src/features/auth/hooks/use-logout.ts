"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { signOutAction } from "../actions/auth-actions";

export function useLogout() {
  const router = useRouter();
  const tt = useTranslations("auth.toasts");
  const [isPending, startTransition] = useTransition();

  function logout() {
    startTransition(async () => {
      await signOutAction();
      toast.success(tt("loggedOut"));
      router.push("/login");
      router.refresh();
    });
  }

  return { logout, isPending };
}
