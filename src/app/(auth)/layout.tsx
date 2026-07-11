import Image from "next/image";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getUser } from "@/lib/auth/server";
import { LanguageToggle } from "@/features/localization";
import { ThemeToggle } from "@/features/theme";

const SCOPES = [1, 2, 3];

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Already signed in? Skip the auth screens.
  const user = await getUser();
  if (user) redirect("/dashboard");

  const t = await getTranslations("auth.brand");

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Brand panel: fills its half, hidden on small screens */}
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-primary p-12 text-primary-foreground lg:flex">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-primary-foreground/5"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-32 -left-16 size-96 rounded-full bg-primary-foreground/5"
        />

        {/* The lockup is navy; it needs a light surface to read on the green panel. */}
        <div className="relative">
          <div className="inline-flex items-center rounded-lg bg-white px-3 py-2">
            <Image
              src="/logo.png"
              alt="CECODES"
              width={296}
              height={96}
              className="h-8 w-auto"
              priority
            />
          </div>
        </div>

        {/* The brand green (--primary) is light enough that dimmed near-white text drops
            below AA on it. The eyebrow and tagline therefore sit at full opacity; the
            uppercase tracking and the smaller size keep the eyebrow visually secondary. */}
        <div className="relative space-y-4">
          <p className="text-xs font-medium uppercase tracking-widest">{t("eyebrow")}</p>
          <h2 className="text-4xl font-semibold leading-tight">{t("headline")}</h2>
          <p className="text-primary-foreground">{t("tagline")}</p>
        </div>

        {/* Outlined pills, not a translucent fill: a bg-primary-foreground/10 fill lightens
            the green under the text and pushes it under AA. A border does not. */}
        <div className="relative flex flex-wrap gap-2">
          {SCOPES.map((n) => (
            <span
              key={n}
              className="inline-flex items-center gap-1.5 rounded-full border border-primary-foreground/30 px-3 py-1 text-xs font-medium"
            >
              <span className="size-1.5 rounded-full bg-primary-foreground" />
              {t("scope", { n })}
            </span>
          ))}
        </div>
      </aside>

      {/* Form panel: fills the other half; width controlled by responsive padding */}
      <main className="relative flex items-center justify-center px-6 py-12 sm:px-10 lg:px-16 xl:px-24">
        <div className="absolute right-4 top-4 flex items-center gap-2">
          <ThemeToggle />
          <LanguageToggle />
        </div>
        <div className="w-full">
          {/* Below lg the brand panel is hidden, so the form panel carries the logo. The
              lockup is navy, and in dark mode this panel is a dark surface, so it needs the
              same white chip the brand panel gives it. */}
          <div className="mb-8 flex justify-center lg:hidden">
            <div className="inline-flex items-center rounded-lg bg-white px-3 py-2">
              <Image
                src="/logo.png"
                alt="CECODES"
                width={296}
                height={96}
                className="h-10 w-auto"
              />
            </div>
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
