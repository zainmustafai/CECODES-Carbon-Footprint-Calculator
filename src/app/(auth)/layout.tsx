import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getUser } from "@/lib/auth/server";
import { LanguageToggle } from "@/features/localization";

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
      {/* Brand panel — fills its half; hidden on small screens */}
      <aside className="relative hidden flex-col justify-between bg-primary p-12 text-primary-foreground lg:flex">
        <div className="text-lg font-semibold">Huella de Carbono CECODES</div>
        <div className="space-y-3">
          <h2 className="text-3xl font-semibold leading-tight">{t("headline")}</h2>
          <p className="text-primary-foreground/80">{t("tagline")}</p>
        </div>
        <div className="text-sm text-primary-foreground/70">{t("scopes")}</div>
      </aside>

      {/* Form panel — fills the other half; width controlled by responsive padding, not a max-w cap */}
      <main className="relative flex items-center justify-center px-6 py-12 sm:px-10 lg:px-16 xl:px-24">
        <div className="absolute right-4 top-4">
          <LanguageToggle />
        </div>
        <div className="w-full">{children}</div>
      </main>
    </div>
  );
}
