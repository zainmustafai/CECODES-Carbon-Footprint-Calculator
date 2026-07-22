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
  const user = await getUser();
  if (user) redirect("/dashboard");

  const t = await getTranslations("auth.brand");

  return (
    <div className="relative grid lg:grid-cols-2 min-h-screen">
      {/* Brand Side */}
      <aside className="hidden relative lg:flex flex-col bg-muted/30 border-r overflow-hidden">
        {/* Subtle grid texture */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `radial-gradient(circle, currentColor 0.5px, transparent 0.5px)`,
            backgroundSize: "24px 24px",
          }}
        />

        {/* Floating gradient orbs */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="-top-32 -left-32 absolute bg-primary/5 blur-3xl rounded-full size-96" />
          <div className="-right-32 -bottom-32 absolute bg-secondary/5 blur-3xl rounded-full size-96" />
          <div className="top-1/2 left-1/2 absolute bg-primary/2 blur-3xl rounded-full size-125 -translate-x-1/2 -translate-y-1/2" />
        </div>

        <div className="relative flex flex-col justify-between p-10 xl:p-14 h-full">
          {/* Top content */}
          <div className="space-y-16">
            {/* Logo */}
            <div className="flex justify-center items-center dark:bg-white">
              <Image
                src="/logo.png"
                alt="CECODES"
                width={400}
                height={40}
                className="mx-auto w-auto h-25"
                priority
              />
            </div>

            {/* Brand message */}
            <div className="space-y-6">
              <p className="font-mono text-[11px] text-muted-foreground uppercase tracking-[0.25em]">
                {t("eyebrow")}
              </p>
              <h2 className="font-light text-4xl xl:text-5xl leading-[1.1] tracking-tight">
                {t("headline")}
              </h2>
              <p className="max-w-sm text-muted-foreground text-base leading-relaxed">
                {t("tagline")}
              </p>
            </div>
          </div>

          {/* Bottom content */}
          <div className="space-y-8">
            <div className="bg-linear-to-r via-foreground/10 from-border to-border h-px" />

            {/* Stats */}
            <div className="gap-6 grid grid-cols-3">
              {SCOPES.map((n) => (
                <div key={n} className="space-y-1">
                  <span className="font-mono font-light text-2xl">0{n}</span>
                  <p className="text-muted-foreground text-xs tracking-wide">
                    {t("scope", { n })}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </aside>

      {/* Form Side */}
      <main className="relative flex justify-center items-center">
        {/* Ambient glow */}
        <div className="absolute inset-0 flex justify-center items-center pointer-events-none">
          <div className="bg-primary/3 blur-3xl rounded-full size-150" />
        </div>

        {/* Controls */}
        <div className="top-6 right-6 absolute flex items-center">
          <div className="flex items-center gap-0.5 bg-background shadow-sm p-1 border rounded-lg">
            <ThemeToggle />
            <div className="bg-border w-px h-5" />
            <LanguageToggle />
          </div>
        </div>

        {/* Content */}
        <div className="relative space-y-8 mx-auto px-6 w-full max-w-lg">
          {/* Mobile logo */}
          <div className="lg:hidden flex justify-center items-center bg-white rounded-2xl">
            <Image
              src="/logo.png"
              alt="CECODES"
              width={500}
              height={35}
              className="w-auto h-20"
            />
          </div>

          {/* Form card */}
          <div className="bg-card shadow-2xl shadow-foreground/2 p-8 border rounded-2xl">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
