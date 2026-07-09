"use client";

import { useTransition } from "react";
import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { setLocale } from "../actions/set-locale";
import type { Locale } from "@/i18n/config";

// All the locale-switching logic lives here; the toggle component just renders.
export function useChangeLocale() {
  const current = useLocale() as Locale;
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function change(locale: Locale) {
    if (locale === current) return;
    startTransition(async () => {
      await setLocale(locale);
      router.refresh();
    });
  }

  return { current, change, isPending };
}
