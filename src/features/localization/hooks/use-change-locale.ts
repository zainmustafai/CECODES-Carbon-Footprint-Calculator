"use client";

import { useEffect, useRef, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { setLocale } from "../actions/set-locale";
import type { Locale } from "@/i18n/config";

// All the locale-switching logic lives here; the toggle component just renders.
//
// Switching re-renders every server component in the new language, which takes a moment (the
// heavy screens re-fetch), and the only other signal was two disabled buttons. A loading toast
// covers the whole wait and becomes the success toast only when the transition settles, i.e.
// once the re-rendered, new-language tree has committed. Resolving inside the transition callback
// instead would fire success the instant router.refresh() is CALLED, roughly 1.7s before the
// page actually switches, so the toast would claim "done" while the screen still felt stuck.
// The transition stays pending through the refresh re-render (same guarantee useToastAction
// relies on), so isPending falling back to false is the honest "switch finished" signal.
//
// The copy is captured at click time so the toast stays in the language the user was reading,
// even though it resolves one render later, after the tree has re-rendered in the new one.
export function useChangeLocale() {
  const current = useLocale() as Locale;
  const t = useTranslations("language.toasts");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // The toast outlives the click: opened in `change`, resolved in the effect below when the
  // transition ends. The ref carries the toast id and its captured copy across that gap, plus
  // whether the server action failed.
  const activeToast = useRef<{
    id: string | number;
    successText: string;
    errorText: string;
    failed: boolean;
  } | null>(null);
  const wasPending = useRef(false);

  function change(locale: Locale) {
    if (locale === current || isPending) return;
    activeToast.current = {
      id: toast.loading(t("switching")),
      successText: t("switched"),
      errorText: t("failed"),
      failed: false,
    };
    startTransition(async () => {
      try {
        await setLocale(locale);
        router.refresh();
      } catch {
        if (activeToast.current) activeToast.current.failed = true;
      }
    });
  }

  useEffect(() => {
    if (wasPending.current && !isPending && activeToast.current) {
      const { id, successText, errorText, failed } = activeToast.current;
      activeToast.current = null;
      if (failed) toast.error(errorText, { id });
      else toast.success(successText, { id });
    }
    wasPending.current = isPending;
  }, [isPending]);

  return { current, change, isPending };
}
