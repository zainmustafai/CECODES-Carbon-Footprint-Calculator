import { requireUser } from "@/lib/auth/server";
import { ResetPasswordScreen } from "@/features/auth";

// Where every password-change path lands, and there are now two kinds of visitor.
//
// With ?token=..., this is the self-hosted recovery link and the visitor is ANONYMOUS on purpose:
// the token buys one password change and never a session, so a forwarded email cannot become one.
// requireUser() must not run on that branch, or the only people the link exists for are bounced
// to /login before they can type anything.
//
// Without a token it is the signed-in "Cambiar contraseña" item in the account menu (and the
// Supabase recovery link, which signs the user in at /auth/callback before landing here), so the
// session guard stays exactly where it has always been.
//
// It lives OUTSIDE the (auth) route group on purpose: that layout redirects anyone with a session
// straight to POST_LOGIN_PATH, and the no-token case only makes sense WITH a session. While it
// lived inside the group, the recovery flow bounced away before the user could type a new
// password. The token case needs the same exemption, for anyone who follows the link while still
// signed in somewhere.
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { token } = await searchParams;
  // A repeated ?token= arrives as an array, which is a hand-crafted URL rather than anything an
  // email client produces. Picking one of the two would be a guess, so it counts as no token and
  // falls through to the guarded branch.
  const resetToken = typeof token === "string" && token.length > 0 ? token : undefined;

  if (!resetToken) await requireUser();

  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <div className="w-full rounded-2xl border bg-card p-8 shadow-2xl shadow-foreground/2 sm:max-w-md">
        <ResetPasswordScreen token={resetToken} />
      </div>
    </main>
  );
}
