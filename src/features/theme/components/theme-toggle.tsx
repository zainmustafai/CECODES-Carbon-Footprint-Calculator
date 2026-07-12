"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useThemeToggle, type ThemeOption } from "../hooks/use-theme-toggle";

const OPTION_ICON: Record<ThemeOption, typeof Sun> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
};

// Light / Dark / System, mirroring the LanguageToggle's place in the top bar. The trigger shows
// a sun on light and a moon on dark; the menu is a radio group so the active theme reads as
// checked to assistive tech, not just visually.
export function ThemeToggle() {
  const t = useTranslations("theme");
  const { options, current, select } = useThemeToggle();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("toggle")}
          className="relative"
        >
          {/* The trigger icon crossfades purely on the `.dark` class, so it reads no theme
              state and cannot hydrate-mismatch: sun in light, moon in dark. */}
          <Sun
            aria-hidden
            className="absolute inset-0 m-auto rotate-0 scale-100 transition-transform duration-200 dark:-rotate-90 dark:scale-0"
          />
          <Moon
            aria-hidden
            className="absolute inset-0 m-auto rotate-90 scale-0 transition-transform duration-200 dark:rotate-0 dark:scale-100"
          />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40">
        <DropdownMenuRadioGroup
          value={current ?? ""}
          onValueChange={(value) => select(value as ThemeOption)}
        >
          {options.map((option) => {
            const Icon = OPTION_ICON[option];
            return (
              <DropdownMenuRadioItem key={option} value={option}>
                <Icon aria-hidden />
                {t(option)}
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
