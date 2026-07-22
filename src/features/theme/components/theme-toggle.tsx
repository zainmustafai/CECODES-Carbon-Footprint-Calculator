"use client";

import { Moon, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useThemeToggle } from "../hooks/use-theme-toggle";

/**
 * Single-click theme toggle that cycles between light ↔ dark.
 * Uses CSS crossfade on both icons to prevent hydration mismatch.
 * The button simply calls select() with the opposite theme.
 */
export function ThemeToggle() {
  const t = useTranslations("theme");
  const { current, select } = useThemeToggle();

  const handleClick = () => {
    select(current === "dark" ? "light" : "dark");
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleClick}
      aria-label={t("toggle")}
      className="relative"
    >
      {/* Both icons always render. The `.dark` class on <html> controls visibility
          via Tailwind's dark: variant — no hydration mismatch possible. */}
      <Sun
        aria-hidden
        className="absolute inset-0 m-auto rotate-0 dark:-rotate-90 scale-100 dark:scale-0 transition-transform duration-200"
      />
      <Moon
        aria-hidden
        className="absolute inset-0 m-auto rotate-90 dark:rotate-0 scale-0 dark:scale-100 transition-transform duration-200"
      />
      <span className="sr-only">{t("toggle")}</span>
    </Button>
  );
}
