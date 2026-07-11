"use client";

import { useState } from "react";
import { Controller } from "react-hook-form";
import { useTranslations } from "next-intl";
import { Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { TextField } from "@/components/form/text-field";
import { SelectField } from "@/components/form/select-field";
import { NO_COMPANY } from "../schemas/user-schemas";
import { useUserForm, type EditableUser, type Role } from "../hooks/use-user-form";

export type CompanyOption = { id: string; name: string };

type UserDialogProps = {
  companies: CompanyOption[];
  // Present => edit mode (role and company only). Absent => create mode.
  user?: EditableUser;
  // Controlled open, used when the dialog is opened from a row's actions menu. When omitted,
  // the dialog owns its state and renders its own "Nuevo usuario" trigger button (create).
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export function UserDialog({ companies, user, open, onOpenChange }: UserDialogProps) {
  const t = useTranslations("admin.users");
  const isEdit = Boolean(user);
  const isControlled = open !== undefined;
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = isControlled ? open : internalOpen;
  const setOpen = (next: boolean) =>
    isControlled ? onOpenChange?.(next) : setInternalOpen(next);

  const {
    form,
    role,
    setRole,
    fillGeneratedPassword,
    onSubmit,
    isSubmitting,
    serverError,
  } = useUserForm({ user, onDone: () => setOpen(false) });

  const roleOptions = [
    { value: "COMPANY_USER", label: t("roleCompany") },
    { value: "CECODES_ADMIN", label: t("roleAdmin") },
  ];
  const companyOptions = [
    { value: NO_COMPANY, label: t("companyNone") },
    ...companies.map((company) => ({ value: company.id, label: company.name })),
  ];
  const isAdmin = role === "CECODES_ADMIN";

  return (
    <Dialog open={isOpen} onOpenChange={setOpen}>
      {isEdit ? null : (
        <DialogTrigger asChild>
          <Button>
            <Plus className="size-4" aria-hidden />
            {t("create")}
          </Button>
        </DialogTrigger>
      )}

      <DialogContent>
        <form onSubmit={onSubmit} noValidate>
          <DialogHeader>
            <DialogTitle>{isEdit ? t("editTitle") : t("createTitle")}</DialogTitle>
            <DialogDescription>{t("dialogSubtitle")}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-6">
            {isEdit ? null : (
              <>
                <TextField
                  label={t("email")}
                  type="email"
                  autoComplete="off"
                  placeholder={t("emailPlaceholder")}
                  {...form.register("email")}
                  error={form.formState.errors.email?.message}
                />

                <div className="grid gap-2">
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
                    <Button
                      type="button"
                      variant="outline"
                      onClick={fillGeneratedPassword}
                    >
                      <RefreshCw className="size-4" aria-hidden />
                      {t("generate")}
                    </Button>
                  </div>
                  <p className="text-sm text-muted-foreground">{t("tempPasswordHelp")}</p>
                </div>
              </>
            )}

            <Controller
              control={form.control}
              name="role"
              render={({ field }) => (
                <SelectField
                  id="user-role"
                  label={t("role")}
                  options={roleOptions}
                  value={field.value}
                  onValueChange={(value) => setRole(value as Role)}
                />
              )}
            />

            <Controller
              control={form.control}
              name="companyId"
              render={({ field }) => (
                <div className="grid gap-2">
                  <SelectField
                    id="user-company"
                    label={t("company")}
                    options={companyOptions}
                    // An admin owns no company: force and lock the control.
                    value={isAdmin ? NO_COMPANY : field.value}
                    onValueChange={field.onChange}
                    disabled={isAdmin}
                  />
                  <p className="text-sm text-muted-foreground">{t("companyNoneHelp")}</p>
                </div>
              )}
            />

            {serverError ? (
              <p className="text-sm text-destructive">{serverError}</p>
            ) : null}
          </div>

          <DialogFooter>
            <Button type="submit" loading={isSubmitting}>
              {isEdit ? t("save") : t("create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
