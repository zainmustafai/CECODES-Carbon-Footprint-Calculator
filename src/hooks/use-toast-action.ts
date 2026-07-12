"use client";

import { useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

// The async-feedback standard for imperative mutations (row actions, toggles, deletes).
//
// Nothing may feel stuck: the moment an action starts, a loading toast appears; when it
// settles, that SAME toast becomes the success or error toast (sonner replaces by id).
//
// Why not toast.promise: our server actions return `{ error?: string }` instead of
// throwing, so toast.promise's reject mapping would fight the codebase. The explicit
// id-update below matches how the actions actually behave.
//
// Forms with a visible submit button do NOT use this: they show a Button spinner and an
// inline serverError. Autosave does not use this either: it owns the SaveStatus pill.
// See the policy matrix in the implementation plan.

export type ToastActionResult = { error?: string };

export type RunOptions = {
  /** Already translated. Shown while the action is in flight. */
  loading: string;
  /** Already translated. Omit to dismiss the loading toast silently on success. */
  success?: string;
  /** Maps the action's i18n error key to translated copy. */
  errorMessage: (key: string) => string;
  /** Drains a pending autosave debounce before the server reads the rows. */
  flushFirst?: () => Promise<void> | void;
  /** Runs after a successful action (close a dialog, restore focus). */
  onSuccess?: () => void;
  /** router.refresh() inside the transition. Default true. */
  refresh?: boolean;
};

export function useToastAction(): {
  isPending: boolean;
  run: (
    action: () => Promise<ToastActionResult>,
    options: RunOptions,
  ) => Promise<boolean>;
} {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const run = useCallback(
    (action: () => Promise<ToastActionResult>, options: RunOptions) =>
      // The transition stays pending until router.refresh() has re-rendered, so a row
      // never unmounts while its own confirm dialog is still showing a spinner.
      new Promise<boolean>((resolve) => {
        startTransition(async () => {
          const toastId = toast.loading(options.loading);
          try {
            if (options.flushFirst) await options.flushFirst();

            const result = await action();

            if (result?.error) {
              toast.error(options.errorMessage(result.error), { id: toastId });
              resolve(false);
              return;
            }

            if (options.success) {
              toast.success(options.success, { id: toastId });
            } else {
              toast.dismiss(toastId);
            }

            if (options.refresh !== false) router.refresh();
            options.onSuccess?.();
            resolve(true);
          } catch {
            // A thrown action means a transport or runtime failure, not a domain error.
            toast.error(options.errorMessage("generic"), { id: toastId });
            resolve(false);
          }
        });
      }),
    [router],
  );

  return { isPending, run };
}
