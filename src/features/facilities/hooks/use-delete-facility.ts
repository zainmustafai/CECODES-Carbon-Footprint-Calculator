"use client";

import { useTranslations } from "next-intl";
import { useToastAction } from "@/hooks/use-toast-action";
import { deleteFacility } from "../actions/facility-actions";

export function useDeleteFacility() {
  const te = useTranslations("facilities.errors");
  const tt = useTranslations("facilities.toasts");
  const { isPending, run } = useToastAction();

  const remove = (facilityId: string) =>
    run(() => deleteFacility({ facilityId }), {
      loading: tt("deleting"),
      success: tt("deleted"),
      errorMessage: (key) => te(key),
    });

  return { remove, isPending };
}
