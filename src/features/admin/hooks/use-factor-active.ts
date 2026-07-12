"use client";

import { useTranslations } from "next-intl";
import { useToastAction } from "@/hooks/use-toast-action";
import { setFactorActive } from "../actions/factor-actions";

// Deactivate / reactivate is an imperative row action, so it follows the async-feedback
// standard: a loading toast that becomes success or error by id.
export function useFactorActive() {
  const tt = useTranslations("admin.factors.toasts");
  const te = useTranslations("admin.factors.errors");
  const { isPending, run } = useToastAction();

  const toggle = (factorId: string, nextActive: boolean) =>
    run(() => setFactorActive({ factorId, active: nextActive }), {
      loading: nextActive ? tt("activating") : tt("deactivating"),
      success: nextActive ? tt("activated") : tt("deactivated"),
      errorMessage: (key) => te(key),
    });

  return { isPending, toggle };
}
