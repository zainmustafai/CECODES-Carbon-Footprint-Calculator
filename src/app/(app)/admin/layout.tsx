import { requireAdmin } from "@/lib/auth/server";

// Gates every /admin page render. This is NOT the security boundary: Server Actions are
// independent POST endpoints that never run a layout, so each action guards itself too.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return children;
}
