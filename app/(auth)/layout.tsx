import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth/server";

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Already signed in? Skip the auth screens.
  const user = await getUser();
  if (user) redirect("/dashboard");

  return (
    <main className="flex flex-1 items-center justify-center p-6">{children}</main>
  );
}
