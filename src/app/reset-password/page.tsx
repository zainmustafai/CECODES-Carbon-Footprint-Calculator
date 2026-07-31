import { requireUser } from "@/lib/auth/server";
import { ResetPasswordScreen } from "@/features/auth";

// Where both password-change paths land: the email recovery link (via /auth/callback, which
// signs the user in first) and the signed-in "Cambiar contraseña" item in the account menu.
//
// It lives OUTSIDE the (auth) route group on purpose: that layout redirects anyone with a
// session straight to /dashboard, and this page only makes sense WITH a session. While it
// lived inside the group, the recovery flow bounced to /dashboard before the user could type
// a new password.
export default async function Page() {
  await requireUser();

  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <div className="w-full rounded-2xl border bg-card p-8 shadow-2xl shadow-foreground/2 sm:max-w-md">
        <ResetPasswordScreen />
      </div>
    </main>
  );
}
