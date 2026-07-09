import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { BarChart3 } from "lucide-react";
import { getUser } from "@/lib/auth/server";
import { LanguageToggle } from "@/features/localization";

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

        <div className="relative flex items-center gap-2 font-semibold">
          <BarChart3 className="size-5" />
          <span>CECODES</span>
        </div>

        <div className="relative space-y-4">
          <p className="text-xs font-medium uppercase tracking-widest text-primary-foreground/70">
            {t("eyebrow")}
          </p>
          <h2 className="text-4xl font-semibold leading-tight">{t("headline")}</h2>
          <p className="text-primary-foreground/80">{t("tagline")}</p>
        </div>

        <div className="relative flex flex-wrap gap-2">
          {SCOPES.map((n) => (
            <span
              key={n}
              className="inline-flex items-center gap-1.5 rounded-full bg-primary-foreground/10 px-3 py-1 text-xs font-medium"
            >
              <span className="size-1.5 rounded-full bg-primary-foreground/70" />
              {t("scope", { n })}
            </span>
          ))}
        </div>
      </aside>

      {/* Form panel: fills the other half; width controlled by responsive padding */}
      <main className="relative flex items-center justify-center px-6 py-12 sm:px-10 lg:px-16 xl:px-24">
        <div className="absolute right-4 top-4">
          <LanguageToggle />
        </div>
        <div className="w-full">{children}</div>
      </main>
    </div>
  );
}
