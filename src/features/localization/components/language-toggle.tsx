"use client";

import { Button } from "@/components/ui/button";
import { LOCALES, type Locale } from "@/i18n/config";
import { useChangeLocale } from "../hooks/use-change-locale";

const LABEL: Record<Locale, string> = { es: "ES", en: "EN" };

export function LanguageToggle() {
  const { current, change, isPending } = useChangeLocale();

  return (
    <div className="inline-flex items-center gap-0.5 rounded-md border p-0.5">
      {LOCALES.map((locale) => (
        <Button
          key={locale}
          type="button"
          size="sm"
          variant={current === locale ? "secondary" : "ghost"}
          className="h-7 px-2 text-xs font-medium"
          disabled={isPending}
          onClick={() => change(locale)}
          aria-pressed={current === locale}
        >
          {LABEL[locale]}
        </Button>
      ))}
    </div>
  );
}
