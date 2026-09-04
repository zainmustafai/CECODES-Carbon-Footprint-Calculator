import { expect, test, type APIRequestContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { E2E_EMAIL_DOMAIN, E2E_PASSWORD, createE2EUser, db, deleteE2EUser } from "./fixture";

// The only test that proves rendering, transport, delivery and consumption TOGETHER. Every other
// reset-related test in this suite (unit or e2e) stops at "we handed it to the transport" or
// mocks the transport outright.
//
// Mirrors playwright.config.ts's own BASE_URL: SITE_URL is set to that same value in the
// webServer's env block, but only for the spawned dev-server PROCESS, not for the Node process
// running this test file, so reading process.env.SITE_URL here would read nothing and the
// assertion below would silently pass against the fallback string instead of the value the app
// was actually configured with. Recomputing it the same way the config does is what keeps the
// assertion honest.
const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:8025";

type MailpitMessage = { ID: string };
type MailpitSearchResult = { messages: MailpitMessage[] };
type MailpitFullMessage = { Text: string };

/** Polls, because delivery is asynchronous and a fixed sleep is either flaky or slow. */
async function waitForMessage(request: APIRequestContext, to: string): Promise<MailpitMessage> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const response = await request.get(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`);
    if (response.ok()) {
      const body = (await response.json()) as MailpitSearchResult;
      if (body.messages?.length) return body.messages[0];
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("no message arrived in Mailpit within 15s");
}

// Anonymous on purpose. /forgot-password and /login both live in the (auth) route group, whose
// layout redirects anyone carrying a session straight to POST_LOGIN_PATH (src/app/(auth)/layout.tsx),
// so the default chromium project's storageState (a signed-in fixture user) would bounce this test
// off both pages before it ever saw a form.
test.use({ storageState: { cookies: [], origins: [] } });

test("AUTH-32 AUTH-35 AUTH-37 a reset link arrives, works once, and replaces the old password", async ({
  page,
  request,
}) => {
  // Namespaced under E2E_EMAIL_DOMAIN so global-teardown's sweep reclaims it even if this test
  // dies before its own cleanup runs. No companyId: this test only cares about the credential,
  // not the tenant, and createE2EUser always provisions E2E_PASSWORD as the starting password.
  const email = `e2e-reset-${randomUUID().slice(0, 8)}@${E2E_EMAIL_DOMAIN}`;
  const replacement = "Clave-Nueva-456789!";
  const client = await db();
  const id = await createE2EUser(client, email);

  try {
    // A clean inbox, so waitForMessage cannot pick up a stale message left by an earlier run.
    await request.delete(`${MAILPIT}/api/v1/messages`);

    await page.goto("/forgot-password");
    await page.fill('input[name="email"]', email);
    await page.getByRole("button", { name: /enviar|restablecer/i }).click();

    const message = await waitForMessage(request, email);
    const raw = (await (await request.get(`${MAILPIT}/api/v1/message/${message.ID}`)).json()) as MailpitFullMessage;
    const link = raw.Text.match(/https?:\/\/\S+/)?.[0];
    expect(link, "the message must carry an absolute link").toBeTruthy();

    // AUTH-35: the origin comes from configuration (SITE_URL here), not from the request's Host
    // header. A Host-derived link is host-header injection: an attacker requests a reset for
    // someone else's account and the real user is mailed a real token pointing at the attacker's
    // site instead of this deployment.
    expect(link!.startsWith(BASE_URL)).toBe(true);

    await page.goto(link!);
    // requireCurrentPassword is false on the token branch (ResetPasswordScreen), so only these two
    // fields exist; both are required and must match (resetPasswordSchema's refine).
    await page.fill('input[name="password"]', replacement);
    await page.fill('input[name="confirmPassword"]', replacement);
    await page.getByRole("button", { name: /guardar|cambiar|crear/i }).click();

    // The token flow never issues a session (proving you can read an inbox earns one password
    // change, not a session), so success lands on /login rather than carrying the user into the
    // app. Waiting for that navigation is also what proves the submit actually succeeded, rather
    // than failing client-side validation silently.
    // Reaching /login at all is now also a regression guard, for a bug this spec was written
    // before and could never have caught, because the spec had never actually been run:
    // use-reset-password paired router.push with an unconditional router.refresh(), and the
    // refresh re-fetched the route being left and cancelled the push. A SUCCESSFUL reset
    // therefore stranded the user on the reset form, and clicking the link again told them it
    // was no longer valid. Waiting for this navigation is what proves the submit both succeeded
    // and took the user somewhere.
    await page.waitForURL("**/login");

    // The old password is gone, not merely joined by a second working one. Asserting only that
    // the replacement works would pass just as happily if the reset had ADDED a credential
    // instead of replacing it, which is the failure that matters here. One wrong attempt is
    // safely below the throttle's five, and the reset itself cleared the counter.
    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', E2E_PASSWORD);
    await page.getByRole("button", { name: /ingresar|iniciar/i }).click();
    await expect(page).toHaveURL(/\/login/);

    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', replacement);
    await page.getByRole("button", { name: /ingresar|iniciar/i }).click();
    await expect(page).not.toHaveURL(/\/login/);

    // AUTH-37: the token is single use. Following it again must not offer a second change: the
    // form still renders (the page never validates the token before rendering it), but submitting
    // through it must be refused with the same opaque "no longer valid" message a never-issued or
    // expired token gets (resetPasswordWithTokenAction's shared "invalidResetLink" key).
    await page.goto(link!);
    await page.fill('input[name="password"]', "Otra-Clave-987654!");
    await page.fill('input[name="confirmPassword"]', "Otra-Clave-987654!");
    await page.getByRole("button", { name: /guardar|cambiar|crear/i }).click();
    await expect(page.getByText(/ya no es válido/i)).toBeVisible();
  } finally {
    await deleteE2EUser(client, id, email);
    await client.end();
  }
});
