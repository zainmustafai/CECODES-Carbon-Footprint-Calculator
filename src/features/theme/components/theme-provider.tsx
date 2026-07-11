"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ComponentProps } from "react";

// Thin client wrapper so the server root layout can mount next-themes. next-themes toggles the
// `.dark` class on <html>, which is the variant globals.css keys its dark tokens on, and injects
// a pre-hydration script that sets that class before first paint. That script is why <html>
// carries suppressHydrationWarning: the server markup has no class, the client adds one, and the
// mismatch on that single attribute is expected.
export function ThemeProvider({
  children,
  ...props
}: ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
