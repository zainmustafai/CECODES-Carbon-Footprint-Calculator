"use client";

import { useTransition } from "react";
import type { FieldValues, SubmitHandler, UseFormReturn } from "react-hook-form";

// The reliable pending state for a form with a visible submit button (feedback shape 1 in
// IMPLEMENTATION.md section 4). Use this instead of `form.formState.isSubmitting`.
//
// Why not `form.formState.isSubmitting` directly: React Compiler is on (next.config.ts), and
// RHF drives `formState` through a Proxy whose getter has to run on every render to keep the
// subscription alive. When a hook reads `form.formState.isSubmitting` once and returns the
// value, the compiler memoizes the hook's result and stops re-running that proxy read, so the
// button never disables or shows its spinner. This was verified in a browser: a multi-second
// sign-in left the "Ingresar" button enabled with no spinner the whole time. The onboarding
// wizard already documents the same effect ("the React Compiler treats [the callback] as
// render-time") and works around one symptom of it with a ref guard.
//
// useTransition owns the pending flag with real React state, which the compiler cannot stale
// cache, so it is the same mechanism the rest of the app already trusts for pending UI
// (use-toast-action, the language toggle, the list filters). It has a second benefit the raw
// flag never had: an async transition stays pending until the work it schedules commits, so
// when the submit handler ends in router.push/router.refresh the button keeps its spinner
// until the destination renders, rather than going idle the instant the action returns while
// the next screen is still loading.
export function useFormSubmit<T extends FieldValues>(
  form: UseFormReturn<T>,
  handler: SubmitHandler<T>,
): {
  onSubmit: (event?: React.BaseSyntheticEvent) => void;
  isSubmitting: boolean;
} {
  const [isSubmitting, startTransition] = useTransition();

  // handleSubmit runs validation and preventDefault synchronously, then calls our callback
  // only when the values are valid. The callback opens the transition; the async work runs
  // inside it, so isSubmitting stays true for the whole action and any navigation it triggers.
  const onSubmit = form.handleSubmit((values) => {
    startTransition(async () => {
      await handler(values);
    });
  });

  return { onSubmit, isSubmitting };
}
