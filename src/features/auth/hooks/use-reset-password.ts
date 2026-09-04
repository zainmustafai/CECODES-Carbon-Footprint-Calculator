"use client";

import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  resetPasswordSchema,
  type ResetPasswordValues,
} from "../schemas/auth-schemas";
import {
  resetPasswordWithTokenAction,
  updatePasswordAction,
} from "../actions/auth-actions";
import { useFormSubmit } from "@/hooks/use-form-submit";
import { POST_LOGIN_PATH } from "@/lib/routes";

/**
 * The two ways a password gets changed, behind one form.
 *
 * They are the same two fields and the same rules, but they end in different places, because a
 * recovery token deliberately does not sign anyone in: proving you can read an inbox earns one
 * password change, not a session. So the token flow finishes at /login, where the new password is
 * typed once to prove it arrived, while the signed-in flow carries on into the app.
 */
export function useResetPassword({
  token,
  requireCurrentPassword = false,
}: { token?: string; requireCurrentPassword?: boolean } = {}) {
  const tv = useTranslations("auth.validation");
  const te = useTranslations("auth.errors");
  const tt = useTranslations("auth.toasts");
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const resolver = useMemo(
    () => zodResolver(resetPasswordSchema(tv, { requireCurrent: requireCurrentPassword })),
    [tv, requireCurrentPassword],
  );
  const form = useForm<ResetPasswordValues>({
    resolver,
    defaultValues: { currentPassword: "", password: "", confirmPassword: "" },
  });

  const { onSubmit, isSubmitting } = useFormSubmit(form, async ({ currentPassword, password }) => {
    setServerError(null);

    // currentPassword is sent only when it was asked for. The action's schema is .strict(), so an
    // empty string riding along on the flows that never collect one would be rejected outright.
    const { error } = token
      ? await resetPasswordWithTokenAction({ token, password })
      : await updatePasswordAction(
          requireCurrentPassword ? { password, currentPassword } : { password },
        );

    if (error) {
      // Server errors are opaque keys, and an unknown one is still an error a human has to read.
      // Falling back keeps a key this build does not have from being printed at the user as
      // "auth.errors.something", which tells them nothing and leaks the internal name instead.
      setServerError(te.has(error) ? te(error) : te("generic"));
      return;
    }

    if (token) {
      // The token never issued a session, so there is nothing to carry into the app: /login is
      // the only place this can end, and typing the new password once proves it arrived. The
      // toast is the notice that lands with them, since the Toaster lives in the root layout and
      // survives the navigation.
      toast.success(tt("passwordResetSignIn"));
      router.push("/login");
    } else {
      toast.success(tt("passwordUpdated"));
      router.push(POST_LOGIN_PATH);
    }
    router.refresh();
  });

  return { form, onSubmit, isSubmitting, serverError };
}
