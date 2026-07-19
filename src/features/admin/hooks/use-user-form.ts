"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { generateTempPassword } from "@/lib/generate-password";
import { useFormSubmit } from "@/hooks/use-form-submit";
import { createUser, updateUser } from "../actions/user-actions";
import {
  NO_COMPANY,
  createUserFormSchema,
  updateUserFormSchema,
  type CreateUserFormValues,
} from "../schemas/user-schemas";

export type Role = "COMPANY_USER" | "CECODES_ADMIN";

// The fields an edit needs. Email and the password are not editable, so they are absent.
export type EditableUser = {
  id: string;
  role: Role;
  companyId: string | null;
  name: string | null;
  phone: string | null;
  position: string | null;
};

// One form covers create and edit. The values are the create superset; in edit mode the
// email and password fields are neither rendered nor validated (the update resolver ignores
// them), so their default values simply pass through unused.
type UserFormValues = CreateUserFormValues;

export function useUserForm({
  user,
  onDone,
}: {
  user?: EditableUser;
  onDone?: () => void;
}) {
  const isEdit = Boolean(user);
  const tv = useTranslations("admin.users.validation");
  const te = useTranslations("admin.users.errors");
  const tt = useTranslations("admin.users.toasts");
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const resolver = useMemo(
    () =>
      (isEdit
        ? zodResolver(updateUserFormSchema(tv))
        : zodResolver(createUserFormSchema(tv))) as Resolver<UserFormValues>,
    [isEdit, tv],
  );

  const form = useForm<UserFormValues>({
    resolver,
    defaultValues: {
      email: "",
      tempPassword: "",
      role: user?.role ?? "COMPANY_USER",
      companyId: user?.companyId ?? NO_COMPANY,
      name: user?.name ?? "",
      phone: user?.phone ?? "",
      position: user?.position ?? "",
    },
  });

  // useWatch, not form.watch(): watch() returns a fresh function each render, which makes the
  // React compiler skip memoizing this whole hook. useWatch subscribes to the one field.
  const role = useWatch({ control: form.control, name: "role" });

  const { onSubmit, isSubmitting } = useFormSubmit(form, async (values) => {
    setServerError(null);
    // Map the "no company" sentinel to null, and force null for an admin.
    const companyId =
      values.role === "CECODES_ADMIN" || values.companyId === NO_COMPANY
        ? null
        : values.companyId;

    const contact = { name: values.name, phone: values.phone, position: values.position };
    const { error } = user
      ? await updateUser({ userId: user.id, role: values.role, companyId, ...contact })
      : await createUser({
          email: values.email,
          tempPassword: values.tempPassword,
          role: values.role,
          companyId,
          ...contact,
        });

    if (error) {
      setServerError(te(error));
      return;
    }

    toast.success(tt(user ? "updated" : "created"));
    form.reset(
      user
        ? {
            email: "",
            tempPassword: "",
            role: values.role,
            companyId: values.companyId,
            name: values.name,
            phone: values.phone,
            position: values.position,
          }
        : {
            email: "",
            tempPassword: "",
            role: "COMPANY_USER",
            companyId: NO_COMPANY,
            name: "",
            phone: "",
            position: "",
          },
    );
    onDone?.();
    router.refresh();
  });

  // Setting the role to admin also clears the company, so the two controls can never
  // contradict the "an admin owns no company" invariant.
  function setRole(next: Role) {
    form.setValue("role", next, { shouldDirty: true });
    if (next === "CECODES_ADMIN") {
      form.setValue("companyId", NO_COMPANY, { shouldDirty: true });
    }
  }

  function fillGeneratedPassword() {
    form.setValue("tempPassword", generateTempPassword(), {
      shouldDirty: true,
      shouldValidate: true,
    });
  }

  return {
    form,
    isEdit,
    role,
    setRole,
    fillGeneratedPassword,
    onSubmit,
    isSubmitting,
    serverError,
  };
}
