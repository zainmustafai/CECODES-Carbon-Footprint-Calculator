"use client";

import { useTranslations } from "next-intl";
import { Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useSourceActions } from "../hooks/use-source-actions";

// AlertDialog, never a plain Dialog: this deletes recorded consumption. See DESIGN.md.
export function DeleteSourceButton({
  emissionFactorId,
  element,
}: {
  emissionFactorId: string;
  element: string;
}) {
  const t = useTranslations("dataEntry.deleteDialog");
  const ts = useTranslations("dataEntry.source");
  const { remove, isPending } = useSourceActions();

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`${ts("delete")}: ${element}`}
          disabled={isPending}
        >
          <Trash2 className="size-4 text-muted-foreground" aria-hidden />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("title")}</AlertDialogTitle>
          <AlertDialogDescription>{t("body", { element })}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => remove(emissionFactorId)}
            className="bg-destructive text-white hover:bg-destructive/90"
          >
            {t("confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
