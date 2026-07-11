"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { MoreHorizontal, Pencil, Power, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmActionDialog } from "@/components/feedback/confirm-action-dialog";
import { UserDialog, type CompanyOption } from "./user-dialog";
import { useUserActions } from "../hooks/use-user-actions";
import type { EditableUser } from "../hooks/use-user-form";

type RowUser = EditableUser & { email: string; active: boolean };

export function UserRowActions({
  user,
  companies,
}: {
  user: RowUser;
  companies: CompanyOption[];
}) {
  const t = useTranslations("admin.users");
  const tc = useTranslations("common");
  const [editOpen, setEditOpen] = useState(false);
  const { isPending, setActive, remove } = useUserActions();

  // Literal keys (not a template) so next-intl and TypeScript both keep them checkable.
  const toggle = user.active
    ? {
        title: t("deactivateDialog.title", { email: user.email }),
        body: t("deactivateDialog.body"),
        confirm: t("deactivateDialog.confirm"),
        cancel: t("deactivateDialog.cancel"),
      }
    : {
        title: t("activateDialog.title", { email: user.email }),
        body: t("activateDialog.body"),
        confirm: t("activateDialog.confirm"),
        cancel: t("activateDialog.cancel"),
      };

  return (
    <div className="flex justify-end">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={tc("actions")}>
            <MoreHorizontal className="size-4" aria-hidden />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end">
          {/* Edit opens a controlled dialog rendered outside this menu, so closing the menu
              cannot unmount it mid-flight. */}
          <DropdownMenuItem onSelect={() => setEditOpen(true)}>
            <Pencil className="size-4" aria-hidden />
            {t("edit")}
          </DropdownMenuItem>

          {/* Activate / deactivate. The confirm's trigger IS this menu item, so onSelect must
              preventDefault: otherwise selecting it closes the menu, unmounts the trigger, and
              the AlertDialog never opens. */}
          <ConfirmActionDialog
            trigger={
              <DropdownMenuItem onSelect={(event) => event.preventDefault()}>
                <Power className="size-4" aria-hidden />
                {user.active ? t("deactivate") : t("activate")}
              </DropdownMenuItem>
            }
            title={toggle.title}
            description={toggle.body}
            cancelLabel={toggle.cancel}
            confirmLabel={toggle.confirm}
            pending={isPending}
            destructive={user.active}
            onConfirm={() => setActive(user.id, !user.active)}
          />

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
            title={t("deleteDialog.title", { email: user.email })}
            description={t("deleteDialog.body")}
            cancelLabel={t("deleteDialog.cancel")}
            confirmLabel={t("deleteDialog.confirm")}
            pending={isPending}
            destructive
            onConfirm={() => remove(user.id)}
          />
        </DropdownMenuContent>
      </DropdownMenu>

      <UserDialog
        companies={companies}
        user={user}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
    </div>
  );
}
