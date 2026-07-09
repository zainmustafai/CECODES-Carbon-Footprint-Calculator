import Link from "next/link";
import { BarChart3 } from "lucide-react";
import { NavLinks } from "./nav-links";

export function AppSidebar({ role }: { role: string }) {
  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r bg-sidebar lg:flex">
      <Link
        href="/dashboard"
        className="flex h-16 items-center gap-2 border-b px-6 font-semibold"
      >
        <BarChart3 className="size-5 text-primary" />
        <span>CECODES</span>
      </Link>
      <nav className="flex-1 p-4">
        <NavLinks role={role} />
      </nav>
    </aside>
  );
}
