"use client";

import { useTranslations } from "next-intl";
import { useToastAction } from "@/hooks/use-toast-action";
import { deleteUser, setUserActive } from "../actions/user-actions";

// The imperative row actions (activate/deactivate, delete). Each shows a loading toast that
// becomes the success or error toast, and resolves true only on success so a
// ConfirmActionDialog stays open with its spinner until the write settles.
export function useUserActions() {
  const tt = useTranslations("admin.users.toasts");
  const te = useTranslations("admin.users.errors");
  const { isPending, run } = useToastAction();

  function setActive(userId: string, active: boolean) {
    return run(() => setUserActive({ userId, active }), {
      loading: active ? tt("activating") : tt("deactivating"),
      success: active ? tt("activated") : tt("deactivated"),
      errorMessage: (key) => te(key),
    });
  }

  function remove(userId: string) {
    return run(() => deleteUser({ userId }), {
      loading: tt("deleting"),
      success: tt("deleted"),
      errorMessage: (key) => te(key),
    });
  }

  return { isPending, setActive, remove };
}
