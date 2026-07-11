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
      </body>
    </html>
  );
}
