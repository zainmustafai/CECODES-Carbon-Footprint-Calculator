"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { signOutAction } from "../actions/auth-actions";

// Signing out is triggered from a dropdown item that closes immediately, so the toast is the
// only feedback the user gets. It starts as a loading toast and becomes the success toast.
export function useLogout() {
  const router = useRouter();
  const tt = useTranslations("auth.toasts");
  const [isPending, startTransition] = useTransition();

  function logout() {
    startTransition(async () => {
      const toastId = toast.loading(tt("loggingOut"));
      await signOutAction();
      toast.success(tt("loggedOut"), { id: toastId });
      router.push("/login");
      router.refresh();
    });
  }

  return { logout, isPending };
}
