import { requireUser } from "@/lib/auth/server";
import { LanguageToggle } from "@/features/localization";
import { SignOutButton } from "@/features/auth";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="flex items-center justify-between gap-4 border-b px-6 py-3">
        <span className="font-semibold">Huella de Carbono CECODES</span>
        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-muted-foreground sm:inline">
            {user.email}
          </span>
          <LanguageToggle />
          <SignOutButton />
        </div>
      </header>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
