/**
 * Where a signed-in user lands when no more specific destination applies.
 *
 * Client feedback 2026-09-04: "we want the user to be land into 'ingreso de datos'". The nav order
 * had already been changed to put data entry first (see app-shell/config/nav.ts), but the landing
 * page was deliberately left on the dashboard at the time; this is the follow-up.
 *
 * It lives in one place because it was hardcoded in eight: the login/register/reset hooks, the
 * onboarding hook, the root page, the auth route-group layout, the route gate behind src/proxy.ts,
 * and a safe-redirect fallback. Changing seven of eight is how a split-brain redirect ships,
 * where the page you reach depends on which door you came through.
 *
 * That last one is gone as of 2026-09-05. src/lib/auth/safe-redirect.ts existed to sanitise a
 * `?next=` destination for the Supabase-era /auth/callback route, and once the route gate was
 * rewritten to carry NO part of the original URL forward (route-gate.ts, asserted by AUTH-52 in
 * its test), nothing supplied a `next` for it to sanitise. A dead open-redirect guard is worse
 * than none: it reads as proof the parameter is handled somewhere. Seven call sites remain.
 *
 * CECODES admins are NOT special-cased here. They have no company, so /data-entry bounces them to
 * /admin exactly as /dashboard did (see app/(app)/data-entry/page.tsx); the role check stays with
 * the page that can read the user, not with this constant.
 */
export const POST_LOGIN_PATH = "/data-entry";
