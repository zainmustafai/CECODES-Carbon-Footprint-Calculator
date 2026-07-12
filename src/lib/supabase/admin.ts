import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Supabase service-role client. It bypasses every auth check and every RLS policy.
//
// SERVER ONLY. Never import this from a client component.
//
// The `server-only` package is deliberately NOT imported here: prisma/seed.ts,
// prisma/seed-demo.ts and prisma/import-factors.ts are plain bun scripts, and that package
// throws outside a React server context. The real protection is that
// SUPABASE_SERVICE_ROLE_KEY is not a NEXT_PUBLIC_ variable, so a browser bundle would
// throw on the missing env var below rather than leak the key.
export function createSupabaseAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "Supabase admin client requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// Finds an auth user by email. The admin API offers no lookup-by-email, so this pages
// through listUsers. Used by the seeds and by admin user creation to repair the case where
// an auth user exists without its app_users profile row.
export async function findAuthUserIdByEmail(
  supabase: SupabaseClient,
  email: string,
): Promise<string | undefined> {
  const target = email.toLowerCase();
  const perPage = 1000;

  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error || !data) return undefined;

    const match = data.users.find((user) => user.email?.toLowerCase() === target);
    if (match) return match.id;
    if (data.users.length < perPage) return undefined;
  }

  return undefined;
}
