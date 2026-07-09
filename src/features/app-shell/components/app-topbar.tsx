import { LanguageToggle } from "@/features/localization";
import { MobileNav } from "./mobile-nav";
import { UserMenu } from "./user-menu";

export function AppTopbar({ email, role }: { email?: string; role: string }) {
  return (
    <header className="flex h-16 items-center gap-3 border-b bg-background px-4 lg:px-8">
      <MobileNav role={role} />
      <div className="flex-1" />
      <LanguageToggle />
      <UserMenu email={email} />
    </header>
  );
}
