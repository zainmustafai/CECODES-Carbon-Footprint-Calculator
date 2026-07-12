"use client";

import { useTranslations } from "next-intl";
import { MoreHorizontal, Pencil, Power, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmActionDialog } from "@/components/feedback/confirm-action-dialog";
import { CompanyDialog } from "./company-dialog";
import { useCompanyActions } from "../hooks/use-company-actions";

type CompanyRowActionsProps = {
  company: { id: string; name: string; sector: string | null; active: boolean };
};

// Row menu for a single company: edit, deactivate/activate, delete.
//
// Every menu item that opens a dialog is the dialog's own trigger and calls
// event.preventDefault() on select. Without it, the dropdown's default "close on select"
// unmounts the trigger before the dialog registers as open, and the dialog never appears.
// preventDefault keeps the trigger mounted; the menu then closes on its own as focus moves
// into the modal. This is why the dialogs live inside DropdownMenuContent here.
export function CompanyRowActions({ company }: CompanyRowActionsProps) {
  const t = useTranslations("admin.companies");
  const tCommon = useTranslations("common");
  const { isPending, setActive, remove } = useCompanyActions();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`${tCommon("actions")}: ${company.name}`}
        >
          <MoreHorizontal className="size-4 text-muted-foreground" aria-hidden />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end">
        <CompanyDialog
          company={company}
          trigger={
            <DropdownMenuItem onSelect={(event) => event.preventDefault()}>
              <Pencil className="size-4" aria-hidden />
              {t("edit")}
            </DropdownMenuItem>
          }
        />

        {company.active ? (
          <ConfirmActionDialog
            destructive={false}
            trigger={
              <DropdownMenuItem onSelect={(event) => event.preventDefault()}>
                <Power className="size-4" aria-hidden />
                {t("deactivate")}
              </DropdownMenuItem>
            }
            title={t("deactivateDialog.title", { name: company.name })}
            description={t("deactivateDialog.body")}
            cancelLabel={t("deactivateDialog.cancel")}
            confirmLabel={t("deactivateDialog.confirm")}
            pending={isPending}
            onConfirm={() => setActive(company.id, false)}
          />
        ) : (
          <ConfirmActionDialog
            destructive={false}
            trigger={
              <DropdownMenuItem onSelect={(event) => event.preventDefault()}>
                <Power className="size-4" aria-hidden />
                {t("activate")}
              </DropdownMenuItem>
            }
            title={t("activateDialog.title", { name: company.name })}
            description={t("activateDialog.body")}
            cancelLabel={t("activateDialog.cancel")}
            confirmLabel={t("activateDialog.confirm")}
            pending={isPending}
            onConfirm={() => setActive(company.id, true)}
          />
        )}

        <DropdownMenuSeparator />

        <ConfirmActionDialog
          trigger={
            <DropdownMenuItem
              variant="destructive"
              onSelect={(event) => event.preventDefault()}
            >
              <Trash2 className="size-4" aria-hidden />
              {t("delete")}
            </DropdownMenuItem>
          }
          title={t("deleteDialog.title", { name: company.name })}
          description={t("deleteDialog.body")}
          cancelLabel={t("deleteDialog.cancel")}
          confirmLabel={t("deleteDialog.confirm")}
          pending={isPending}
          onConfirm={() => remove(company.id)}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
