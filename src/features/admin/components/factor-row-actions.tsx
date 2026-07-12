"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { MoreHorizontal, Pencil, Power, PowerOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmActionDialog } from "@/components/feedback/confirm-action-dialog";
import { useFactorActive } from "../hooks/use-factor-active";

// Row actions for a factor. There is intentionally no delete: a hard delete would orphan
// activity entries through onDelete SetNull. A factor is deactivated and reactivated instead.
export function FactorRowActions({
  factorId,
  element,
  active,
}: {
  factorId: string;
  element: string;
  active: boolean;
}) {
  const t = useTranslations("admin.factors");
  const { isPending, toggle } = useFactorActive();
  const dialogKey = active ? "deactivateDialog" : "activateDialog";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={t("table.actions")}>
          <MoreHorizontal className="size-4" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <Link href={`/admin/factors/${factorId}`}>
            <Pencil className="size-4" aria-hidden />
            {t("grid.edit")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <ConfirmActionDialog
          trigger={
            // preventDefault keeps the menu open so the dialog can take over; without it the
            // menu closes and the dialog never opens.
            <DropdownMenuItem
              variant={active ? "destructive" : "default"}
              onSelect={(event) => event.preventDefault()}
            >
              {active ? (
                <PowerOff className="size-4" aria-hidden />
              ) : (
                <Power className="size-4" aria-hidden />
              )}
              {t(`${dialogKey}.confirm`)}
            </DropdownMenuItem>
          }
          title={t(`${dialogKey}.title`)}
          description={t(`${dialogKey}.body`, { element })}
          cancelLabel={t(`${dialogKey}.cancel`)}
          confirmLabel={t(`${dialogKey}.confirm`)}
          pending={isPending}
          destructive={active}
          onConfirm={() => toggle(factorId, !active)}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
