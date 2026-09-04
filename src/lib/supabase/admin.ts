import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { authProvider } from "@/lib/env";
import { prisma } from "@/lib/prisma";

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

/**
 * Finds the id of the account holding an email address, or undefined.
 *
 * Two implementations behind one name, because the callers (the seeds, and admin user creation
 * repairing a profile-less auth user) only ever wanted the id and never cared which store held
 * it. Keeping the choice here means none of them has to learn the flag.
 *
 * Under `local` the address is a unique column on app_users, so this is one indexed read. Under
 * `supabase` and `shadow` it is still the walk below: the GoTrue admin API offers no
 * lookup-by-email, so the only way to answer is to enumerate users a page at a time, up to ten
 * HTTP round trips and 10,000 rows, to find one id. That walk is also why the answer is capped:
 * beyond 10,000 users it starts reporting "no such account" for accounts that exist.
 *
 * `supabase` may be null so a local-mode caller need not build a service-role client, or hold
 * the env vars to build one. It is ignored under `local`, and under the other two providers a
 * null client can only answer undefined, which is the same answer this function already gives
 * for a failed request.
 */
export async function findAuthUserIdByEmail(
  supabase: SupabaseClient | null,
  email: string,
): Promise<string | undefined> {
  const target = email.toLowerCase();

  if (authProvider() === "local") {
    // An exact match on the unique index rather than a case-insensitive one. Every writer stores
    // the address folded to lower case already (createUserInput lowercases it, and GoTrue had
    // done the same to everything the backfill carried across), so the fold below is enough to
    // reach the row. The case-insensitive alternative would give up the index for a sequential
    // scan and still be the worse answer: app_users.email is unique but case-SENSITIVE, so if two
    // rows ever did differ only by case, an insensitive match would find both and return
    // whichever the planner happened to reach first.
    const row = await prisma.appUser.findUnique({
      where: { email: target },
      select: { id: true },
    });
    return row?.id;
  }

  if (!supabase) return undefined;

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
