"use client";

import { useTranslations } from "next-intl";
import { useToastAction } from "@/hooks/use-toast-action";
import { deleteCompany, setCompanyActive } from "../actions/company-actions";

// The imperative row actions: activate, deactivate, delete. These run through the shared
// toast-action standard (loading toast that becomes success or error), unlike the form,
// which owns a Button spinner. Each returns Promise<boolean> so ConfirmActionDialog can keep
// itself open with a spinner until the action settles.
export function useCompanyActions() {
  const tt = useTranslations("admin.companies.toasts");
  const te = useTranslations("admin.companies.errors");
  const { isPending, run } = useToastAction();

  const setActive = (companyId: string, active: boolean) =>
    run(() => setCompanyActive({ companyId, active }), {
      loading: active ? tt("activating") : tt("deactivating"),
      success: active ? tt("activated") : tt("deactivated"),
      errorMessage: (key) => te(key),
    });

  const remove = (companyId: string) =>
    run(() => deleteCompany({ companyId }), {
      loading: tt("deleting"),
      success: tt("deleted"),
      errorMessage: (key) => te(key),
    });

  return { isPending, setActive, remove };
}
