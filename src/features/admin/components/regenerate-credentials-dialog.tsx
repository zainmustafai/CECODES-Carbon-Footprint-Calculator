"use client";

import { useTranslations } from "next-intl";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TextField } from "@/components/form/text-field";
import { CredentialsBox } from "./credentials-box";
import { useRegenerateCredentials } from "../hooks/use-regenerate-credentials";

// Controlled dialog opened from the user row's actions menu (and therefore rendered OUTSIDE
// the menu, same trap as the edit dialog: closing the menu must not unmount it mid-flight).
// Phase 1 is the password form; a successful submit swaps in the credentials box, the only
// chance to copy or download the new password.
export function RegenerateCredentialsDialog({
  user,
  open,
  onOpenChange,
}: {
  user: { id: string; email: string };
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("admin.users");
  const tCred = useTranslations("admin.credentials");
  const {
    form,
    fillGeneratedPassword,
    onSubmit,
    isSubmitting,
    serverError,
    credentials,
    resetFlow,
  } = useRegenerateCredentials({ user });

  function setOpen(next: boolean) {
    if (!next) resetFlow();
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        {credentials ? (
          <div>
            <DialogHeader>
              <DialogTitle>{t("regenerateTitle")}</DialogTitle>
              <DialogDescription>{t("regeneratedSubtitle")}</DialogDescription>
            </DialogHeader>
            <div className="py-6">
              <CredentialsBox email={credentials.email} password={credentials.password} />
            </div>
            <DialogFooter>
              <Button type="button" onClick={() => setOpen(false)}>
                {tCred("close")}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={onSubmit} noValidate>
            <DialogHeader>
              <DialogTitle>{t("regenerateTitle")}</DialogTitle>
              <DialogDescription>
                {t("regenerateBody", { email: user.email })}
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-2 py-6">
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <TextField
                    label={t("tempPassword")}
                    // Plain text so the admin can read the password they are about to share.
                    type="text"
                    autoComplete="off"
                    {...form.register("tempPassword")}
                    error={form.formState.errors.tempPassword?.message}
                  />
                </div>
                <Button type="button" variant="outline" onClick={fillGeneratedPassword}>
                  <RefreshCw className="size-4" aria-hidden />
                  {t("generate")}
                </Button>
              </div>
              {serverError ? (
                <p className="text-sm text-destructive">{serverError}</p>
              ) : null}
            </div>

            <DialogFooter>
              <Button type="submit" loading={isSubmitting}>
                {t("regenerateConfirm")}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
