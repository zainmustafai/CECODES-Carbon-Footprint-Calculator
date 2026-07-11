import type { Metadata } from "next";
import { Suspense } from "react";
import { Geist, Geist_Mono, Inter } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";
import { cn } from "@/lib/utils";
import { TooltipProvider } from "@/components/ui/tooltip";
import { NavigationProgress } from "@/components/feedback/navigation-progress";
import { ThemeProvider } from "@/features/theme";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CECODES · Huella de Carbono",
  description:
    "Calculadora de huella de carbono corporativa (Alcance 1, 2 y 3) y tablero de visualización de CECODES.",
  // Browser auto-translate (Google Translate) rewrites text nodes into <font> wrappers. When
  // React then updates live text (the data-entry autosave status, month counters), the node is
  // no longer where React left it and removeChild throws, crashing the tree. The app has its own
  // es/en toggle, so translation is redundant here. This meta plus translate="no" on <html> tell
  // browsers to leave the DOM alone.
  other: { google: "notranslate" },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();

  return (
    <html
      lang={locale}
      translate="no"
      className={cn(
        "h-full",
        "antialiased",
        geistSans.variable,
        geistMono.variable,
        "font-sans",
        inter.variable,
      )}
      suppressHydrationWarning
    >
      <body className="flex flex-col min-h-full">
        {/* attribute="class" toggles `.dark` on <html>, the variant globals.css keys its dark
            tokens on. defaultTheme="system" + enableSystem follow the OS until the user picks;
            disableTransitionOnChange stops every tokened surface from animating on the switch. */}
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {/* Suspense is required: NavigationProgress reads useSearchParams, and without a
              boundary that would opt the whole app out of static rendering. */}
          <Suspense fallback={null}>
            <NavigationProgress />
          </Suspense>
          <TooltipProvider>
            <NextIntlClientProvider>
              {children}
              <Toaster />
            </NextIntlClientProvider>
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
