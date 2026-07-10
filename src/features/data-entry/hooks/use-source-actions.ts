"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { addSource, copyJanuaryToAll, removeSource } from "../actions/entries";
import { setCategoryApplies } from "../actions/applicability";
import { useDataEntryContext } from "./use-data-entry-context";

// Wraps the source-level server actions. Each one changes which rows exist or what they
// hold, so every one finishes with router.refresh() and the provider rehydrates the store
// from the new props.
export function useSourceActions() {
  const t = useTranslations("dataEntry");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const { reportingYearId, flushNow } = useDataEntryContext();

  // `flushFirst` drains the autosave debounce before the server reads a cell. Without it,
  // copying January across can run while January itself is still queued in the browser, and
  // the server correctly reports an empty January.
  function run(
    action: () => Promise<{ error?: string }>,
    { successKey, flushFirst = false }: { successKey?: string; flushFirst?: boolean } = {},
  ) {
    startTransition(async () => {
      if (flushFirst) await flushNow();

      const { error } = await action();
      if (error) {
        toast.error(t(`errors.${error}`));
        return;
      }
      if (successKey) toast.success(t(`toasts.${successKey}`));
      router.refresh();
    });
  }

  return {
    isPending,
    add(emissionFactorId: string) {
      if (!reportingYearId) return;
      run(() => addSource({ reportingYearId, emissionFactorId }), { successKey: "sourceAdded" });
    },
    remove(emissionFactorId: string) {
      if (!reportingYearId) return;
      run(() => removeSource({ reportingYearId, emissionFactorId }), {
        successKey: "sourceRemoved",
      });
    },
    copyJanuary(emissionFactorId: string) {
      if (!reportingYearId) return;
      run(() => copyJanuaryToAll({ reportingYearId, emissionFactorId }), {
        successKey: "januaryCopied",
        flushFirst: true,
      });
    },
    setApplies(scope: "SCOPE_1" | "SCOPE_2" | "SCOPE_3", category: string, applies: boolean) {
      if (!reportingYearId) return;
      run(() => setCategoryApplies({ reportingYearId, scope, category, applies }));
    },
  };
}
