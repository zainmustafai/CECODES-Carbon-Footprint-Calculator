/**
 * Where a signed-in user lands when no more specific destination applies.
 *
 * Client feedback 2026-09-04: "we want the user to be land into 'ingreso de datos'". The nav order
 * had already been changed to put data entry first (see app-shell/config/nav.ts), but the landing
 * page was deliberately left on the dashboard at the time; this is the follow-up.
 *
 * It lives in one place because it was hardcoded in eight: the login/register/reset hooks, the
 * onboarding hook, the root page, the auth route-group layout, the route gate behind src/proxy.ts,
 * and the safe-redirect fallback. Changing seven of eight is how a split-brain redirect ships,
 * where the page you reach depends on which door you came through.
 *
 * CECODES admins are NOT special-cased here. They have no company, so /data-entry bounces them to
 * /admin exactly as /dashboard did (see app/(app)/data-entry/page.tsx); the role check stays with
 * the page that can read the user, not with this constant.
 */
export const POST_LOGIN_PATH = "/data-entry";
