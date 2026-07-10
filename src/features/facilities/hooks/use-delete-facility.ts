"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { deleteFacility } from "../actions/facility-actions";

export function useDeleteFacility() {
  const te = useTranslations("facilities.errors");
  const tt = useTranslations("facilities.toasts");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const remove = (facilityId: string) => {
    startTransition(async () => {
      const { error } = await deleteFacility({ facilityId });
      if (error) {
        toast.error(te(error));
        return;
      }
      toast.success(tt("deleted"));
      router.refresh();
    });
  };

  return { remove, isPending };
}
