"use client";

import { useTranslations } from "next-intl";
import { Trash2 } from "lucide-react";
import { ConfirmActionDialog } from "@/components/feedback/confirm-action-dialog";
import { Button } from "@/components/ui/button";
import { useDeleteFacility } from "../hooks/use-delete-facility";

export function DeleteFacilityButton({
  facilityId,
  name,
}: {
  facilityId: string;
  name: string;
}) {
  const t = useTranslations("facilities.deleteDialog");
  const tf = useTranslations("facilities");
  const { remove, isPending } = useDeleteFacility();

  return (
    <ConfirmActionDialog
      trigger={
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`${tf("delete")}: ${name}`}
          disabled={isPending}
        >
          <Trash2 className="size-4 text-muted-foreground" aria-hidden />
        </Button>
      }
      title={t("title")}
      description={t("body", { name })}
      cancelLabel={t("cancel")}
      confirmLabel={t("confirm")}
      pending={isPending}
      onConfirm={() => remove(facilityId)}
      // The card unmounts on the refresh, so send focus back to the page heading.
      onClosed={() => document.getElementById("facilities-heading")?.focus()}
    />
  );
}
