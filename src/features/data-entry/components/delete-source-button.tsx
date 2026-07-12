"use client";

import { useTranslations } from "next-intl";
import { Trash2 } from "lucide-react";
import { ConfirmActionDialog } from "@/components/feedback/confirm-action-dialog";
import { Button } from "@/components/ui/button";
import { useSourceActions } from "../hooks/use-source-actions";

// AlertDialog, never a plain Dialog: this deletes recorded consumption. See DESIGN.md.
//
// ConfirmActionDialog keeps the dialog open, with a spinner on the confirm button, until the
// delete settles. The row and this trigger unmount on the refresh that follows, so `onDeleted`
// hands focus back to a stable element instead of letting it fall to <body>.
export function DeleteSourceButton({
  emissionFactorId,
  element,
  onDeleted,
}: {
  emissionFactorId: string;
  element: string;
  onDeleted?: () => void;
}) {
  const t = useTranslations("dataEntry.deleteDialog");
  const ts = useTranslations("dataEntry.source");
  const { remove, isPending } = useSourceActions();

  return (
    <ConfirmActionDialog
      trigger={
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`${ts("delete")}: ${element}`}
          disabled={isPending}
        >
          <Trash2 className="size-4 text-muted-foreground" aria-hidden />
        </Button>
      }
      title={t("title")}
      description={t("body", { element })}
      cancelLabel={t("cancel")}
      confirmLabel={t("confirm")}
      pending={isPending}
      onConfirm={() => remove(emissionFactorId)}
      onClosed={onDeleted}
    />
  );
}
