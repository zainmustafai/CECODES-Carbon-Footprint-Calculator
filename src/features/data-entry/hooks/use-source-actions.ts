"use client";

import { useTranslations } from "next-intl";
import { useToastAction } from "@/hooks/use-toast-action";
import { addSource, copyJanuaryToAll, removeSource } from "../actions/entries";
import { setCategoryApplies } from "../actions/applicability";
import { useDataEntryContext } from "./use-data-entry-context";

// Wraps the source-level server actions. Each one changes which rows exist or what they
// hold, so every one finishes with router.refresh() (inside useToastAction's transition) and
// the provider rehydrates the store from the new props.
//
// Every call shows a loading toast that becomes the success or the error toast. Before this,
// "no aplica" succeeded in total silence, and a delete gave no sign of life until its toast
// arrived. Autosave is the one flow that deliberately stays out of this: it owns the
// SaveStatus pill.
export function useSourceActions() {
  const t = useTranslations("dataEntry");
  const { isPending, run } = useToastAction();
  const { reportingYearId, flushNow } = useDataEntryContext();

  const errorMessage = (key: string) => t(`errors.${key}`);

  return {
    isPending,

    add(emissionFactorId: string) {
      if (!reportingYearId) return Promise.resolve(false);
      return run(() => addSource({ reportingYearId, emissionFactorId }), {
        loading: t("toasts.addingSource"),
        success: t("toasts.sourceAdded"),
        errorMessage,
      });
    },

    remove(emissionFactorId: string) {
      if (!reportingYearId) return Promise.resolve(false);
      return run(() => removeSource({ reportingYearId, emissionFactorId }), {
        loading: t("toasts.removingSource"),
        success: t("toasts.sourceRemoved"),
        errorMessage,
      });
    },

    copyJanuary(emissionFactorId: string) {
      if (!reportingYearId) return Promise.resolve(false);
      // flushFirst drains the autosave debounce before the server reads a cell. Without it,
      // copying January across can run while January itself is still queued in the browser,
      // and the server correctly reports an empty January.
      return run(() => copyJanuaryToAll({ reportingYearId, emissionFactorId }), {
        loading: t("toasts.copyingJanuary"),
        success: t("toasts.januaryCopied"),
        errorMessage,
        flushFirst: flushNow,
      });
    },

    setApplies(scope: "SCOPE_1" | "SCOPE_2" | "SCOPE_3", category: string, applies: boolean) {
      if (!reportingYearId) return Promise.resolve(false);
      return run(() => setCategoryApplies({ reportingYearId, scope, category, applies }), {
        loading: t("toasts.updatingCategory"),
        success: applies ? t("toasts.categoryEnabled") : t("toasts.categoryDisabled"),
        errorMessage,
      });
    },
  };
}
