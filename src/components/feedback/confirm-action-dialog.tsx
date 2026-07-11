"use client";

import * as React from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Destructive confirm that stays open until its action settles.
//
// Two traps this exists to avoid:
//  1. Radix's AlertDialogAction closes the dialog on click. The old delete buttons used it,
//     so the dialog vanished instantly and the only feedback was a toast that arrived
//     later. Here the confirm is a plain Button, so nothing closes until onConfirm resolves.
//  2. AlertDialogAction renders Button with `asChild`, which cannot host a spinner.
//
// While pending, Escape is refused: closing the dialog would strand a write whose result
// the user can no longer see. Outside clicks need no guard, because an AlertDialog (unlike a
// Dialog) never dismisses on them.
export type ConfirmActionDialogProps = {
  trigger: React.ReactNode;
  title: string;
  description: React.ReactNode;
  cancelLabel: string;
  confirmLabel: string;
  pending: boolean;
  /** Resolves true when the action succeeded. Only then does the dialog close. */
  onConfirm: () => Promise<boolean>;
  /** Runs after a successful close. Use it to put focus somewhere stable. */
  onClosed?: () => void;
  /** Destructive styling on the confirm button. Default true. */
  destructive?: boolean;
};

export function ConfirmActionDialog({
  trigger,
  title,
  description,
  cancelLabel,
  confirmLabel,
  pending,
  onConfirm,
  onClosed,
  destructive = true,
}: ConfirmActionDialogProps) {
  const [open, setOpen] = React.useState(false);

  async function handleConfirm() {
    const succeeded = await onConfirm();
    if (!succeeded) return; // keep the dialog open so the error toast has context
    setOpen(false);
    onClosed?.();
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        setOpen(next);
      }}
    >
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent
        onEscapeKeyDown={(event) => {
          if (pending) event.preventDefault();
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{cancelLabel}</AlertDialogCancel>
          <Button
            loading={pending}
            onClick={handleConfirm}
            className={cn(
              destructive && "bg-destructive text-white hover:bg-destructive/90",
            )}
          >
            {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
