"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";

export const THEME_OPTIONS = ["light", "dark", "system"] as const;
export type ThemeOption = (typeof THEME_OPTIONS)[number];

// A no-op store whose snapshot is `false` on the server and `true` on the client. React swaps
// them after hydration without a mismatch warning, which is the hydration-safe way to know we
// are mounted (the React Compiler lint forbids the setState-in-effect version of this).
const emptySubscribe = () => () => {};

// All the theme-switching logic lives here; the toggle component just renders. next-themes only
// knows the chosen theme after it reads localStorage on the client, so `theme` is undefined on
// the server and the first client render. Reporting `current` as undefined until mounted keeps
// the selected-state indicator from causing a hydration mismatch.
export function useThemeToggle() {
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );

  return {
    options: THEME_OPTIONS,
    current: mounted ? ((theme ?? "system") as ThemeOption) : undefined,
    select: (option: ThemeOption) => setTheme(option),
  };
}
