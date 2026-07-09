import type { AuthError } from "@supabase/supabase-js";

// True when signUp failed because the email is already registered.
export function isEmailInUse(error: AuthError | null): boolean {
  if (!error) return false;
  const message = error.message?.toLowerCase() ?? "";
  return (
    error.code === "user_already_exists" ||
    message.includes("already registered") ||
    message.includes("already been registered")
  );
}
