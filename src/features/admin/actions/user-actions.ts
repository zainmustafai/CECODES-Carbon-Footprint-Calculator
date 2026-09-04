"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import {
  ScopeError,
  resolveAdminScope,
  scopeErrorKey,
} from "@/lib/auth/company-scope";
import { hashPassword } from "@/lib/auth/password";
import { clearSignInThrottle, signInThrottleKeys } from "@/lib/auth/throttle";
import { authProvider } from "@/lib/env";
import { reportError } from "@/lib/observability/report-error";
import {
  createSupabaseAdminClient,
  findAuthUserIdByEmail,
} from "@/lib/supabase/admin";
import {
  createUserInput,
  updateUserInput,
  setUserActiveInput,
  deleteUserInput,
  resetUserPasswordInput,
} from "../schemas/user-schemas";

// Admin user management, across the move off Supabase Auth (src/lib/env.ts, AUTH_PROVIDER).
//
// Two credential stores, one set of actions. Under `supabase` and `shadow`, GoTrue owns the
// password and every write here has to reach it over HTTP before touching Postgres. Under
// `local` the password is a column on app_users and the same write is a single statement in the
// same database as the profile. The guards do not vary with the provider: resolveAdminScope
// first, then the self-edit refusals, then a checked row count on every write.
//
// The local hash is written in EVERY provider, not only `local`. It is dead weight while GoTrue
// still decides sign-ins, and it is the whole game the day the flag flips: an account created,
// or a password rotated, while running on `supabase` would otherwise carry no local credential
// at all, and verifyPassword refuses a null hash rather than waving it through. Those people
// would be locked out by the cutover itself rather than by anything they did, and the backfill
// that gave everyone else a hash has already run.

// app_users.email is a Prisma-owned @unique, so a collision surfaces as P2002. The raw driver
// code "23505" is included for parity with the rest of the codebase's uniqueness checks.
function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("code" in error)) return false;
  const code = (error as { code?: string }).code;
  return code === "P2002" || code === "23505";
}

// Whether a Supabase auth error means the email is already registered. The admin API returns
// this in several shapes across versions, so match on both the code and the message.
//
// GoTrue-shaped, and so `supabase` and `shadow` only. Under `local` there is no second system to
// disagree with: the same collision arrives as a P2002 on app_users.email, which isUniqueViolation
// above already names.
function isEmailAlreadyRegistered(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const code = (error as { code?: string }).code;
  const message = (error as { message?: string }).message?.toLowerCase() ?? "";
  return (
    code === "email_exists" ||
    code === "user_already_exists" ||
    message.includes("already been registered") ||
    message.includes("already registered") ||
    message.includes("already exists")
  );
}

// Whether a Supabase auth error means the user id does not exist. Used so deleting a profile
// whose auth user was already removed (an orphan) still cleans up rather than failing.
//
// Same provider caveat as above, and the orphan it forgives is a two-store artefact: under
// `local` a profile row IS the account, so there is no second half to have gone missing.
function isAuthUserNotFound(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const status = (error as { status?: number }).status;
  const code = (error as { code?: string }).code;
  return status === 404 || code === "user_not_found";
}

// Whether a service-role client could be built, asked instead of built because
// createSupabaseAdminClient throws on a missing variable. That is the right answer for the two
// providers that cannot work without GoTrue and the wrong one for a caller that only wants to
// reach it if it happens to still be standing, which is what deleteUser does under `local`.
//
// The variables are read here rather than through src/lib/env.ts because that module answers
// "may the app boot", not "is this optional integration configured", and SUPABASE_SERVICE_ROLE_KEY
// is deliberately absent from its runtime schema.
function supabaseAdminConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

// Creates an account its owner can sign in with immediately: the admin sets a temporary password
// and dictates it. There are no invite emails and no SMTP dependency.
export async function createUser(input: {
  email: string;
  tempPassword: string;
  role: "COMPANY_USER" | "CECODES_ADMIN";
  companyId?: string | null;
  name?: string;
  phone?: string;
  position?: string;
}): Promise<{ error?: string; userId?: string }> {
  const parsed = createUserInput.safeParse(input);
  if (!parsed.success) return { error: "generic" };
  const { email, tempPassword, role, name, phone, position } = parsed.data;
  // An admin owns no company; force the invariant here too, never only in the schema.
  const companyId = role === "CECODES_ADMIN" ? null : parsed.data.companyId ?? null;
  // Empty contact fields store as NULL, never "".
  const contact = { name: name ?? null, phone: phone ?? null, position: position ?? null };

  try {
    await resolveAdminScope();

    // 1. A chosen company must exist.
    if (companyId) {
      const company = await prisma.company.findUnique({
        where: { id: companyId },
        select: { id: true },
      });
      if (!company) return { error: "companyNotFound" };
    }

    // Hashed after the guards, never before: this costs about a quarter of a second by design
    // (BCRYPT_COST), and a caller who is not an admin must not be able to spend it.
    const { hash, algo } = await hashPassword(tempPassword);
    // An account whose password an admin chose and read out has no address to prove control of
    // and no confirmation mail to wait for, so it is confirmed at creation. This mirrors the
    // `email_confirm: true` the GoTrue branch below passes, and is provenance rather than a gate.
    const credentials = { passwordHash: hash, passwordAlgo: algo, emailConfirmedAt: new Date() };

    let userId: string;

    if (authProvider() === "local") {
      // ONE INSERT, and that is the entire point of this branch.
      //
      // What used to be possible here and is not any more: auth.admin.createUser is an HTTP call,
      // so it could never join the Postgres transaction that writes the profile. A failure landing
      // between the two left a real, sign-in-capable GoTrue account attached to whatever the
      // signup trigger had inserted, a COMPANY_USER profile with no company. The person it
      // belonged to could sign in, landed in onboarding, and was invited to invent a company that
      // nobody had asked for; the admin, meanwhile, had seen the create fail and had no screen
      // that showed the half-made account. Retrying with the same address then hit the repair path
      // below rather than a clean create.
      //
      // The credential and the profile are now columns of the same row, so there are no longer two
      // writes to coordinate and no window to fail inside: it commits whole or not at all. No
      // transaction wraps this because a single statement already is one.
      //
      // The email pre-check the GoTrue branch runs first goes away for the same reason. It exists
      // only to keep a doomed INSERT away from the signup trigger, and the unique index answers
      // the same question here without its read-then-write gap: a collision raises P2002, which
      // the catch at the bottom reports as emailInUse.
      userId = crypto.randomUUID();
      await prisma.appUser.create({
        data: { id: userId, email, role, companyId, active: true, ...credentials, ...contact },
      });
    } else {
      // 2. Pre-check the profile. app_users.email is UNIQUE: if a profile row already exists
      //    for this email but no auth user does, the auth.users INSERT trigger would violate
      //    that constraint and GoTrue returns an opaque 500. Refuse cleanly first. This also
      //    covers the case where both already exist. Only the auth-only orphan (a deleted
      //    profile) falls through to the repair path in step 3.
      const existingProfile = await prisma.appUser.findUnique({
        where: { email },
        select: { id: true },
      });
      if (existingProfile) return { error: "emailInUse" };

      // 3. Create the auth user.
      const supabase = createSupabaseAdminClient();
      let authUserId: string | undefined;

      const { data, error } = await supabase.auth.admin.createUser({
        email,
        password: tempPassword,
        email_confirm: true,
      });

      if (error) {
        // Repair the auth-only orphan: an auth user exists but its profile row was deleted.
        // The signup trigger is INSERT-only, so nothing recreated the profile. Find the auth
        // id and let the upsert below re-create the profile row. Any other auth error is
        // opaque to the client.
        if (isEmailAlreadyRegistered(error)) {
          authUserId = await findAuthUserIdByEmail(supabase, email);
        }
        if (!authUserId) return { error: "authFailed" };
      } else {
        authUserId = data.user?.id;
      }
      if (!authUserId) return { error: "authFailed" };
      userId = authUserId;

      // 4. app_users.id MUST equal the auth user id. The signup trigger already inserted a row
      //    with role COMPANY_USER, ON CONFLICT (id) DO NOTHING, and it NEVER updates. Upsert to
      //    force the role and companyId the admin chose (and to create the row on the repair
      //    path, where the trigger never fired).
      await prisma.appUser.upsert({
        where: { id: userId },
        update: { email, role, companyId, active: true, ...credentials, ...contact },
        create: { id: userId, email, role, companyId, active: true, ...credentials, ...contact },
      });
    }

    revalidatePath("/admin/users");
    revalidatePath("/admin/companies"); // per-company user counts change
    return { userId };
  } catch (error) {
    if (isUniqueViolation(error)) return { error: "emailInUse" };
    return { error: scopeErrorKey(error) };
  }
}

// Changes a user's role, company, and contact details. Email and the password are not editable
// here, so this action is the same in every provider: none of it is credential material.
export async function updateUser(input: {
  userId: string;
  role: "COMPANY_USER" | "CECODES_ADMIN";
  companyId?: string | null;
  name?: string;
  phone?: string;
  position?: string;
}): Promise<{ error?: string }> {
  const parsed = updateUserInput.safeParse(input);
  if (!parsed.success) return { error: "generic" };
  const { userId, role, name, phone, position } = parsed.data;
  const companyId = role === "CECODES_ADMIN" ? null : parsed.data.companyId ?? null;
  const contact = { name: name ?? null, phone: phone ?? null, position: position ?? null };

  try {
    const scope = await resolveAdminScope();
    // Self-lockout guard: an admin cannot change their own role and strip their own access.
    if (userId === scope.appUser.id) return { error: "cannotEditSelf" };

    if (companyId) {
      const company = await prisma.company.findUnique({
        where: { id: companyId },
        select: { id: true },
      });
      if (!company) return { error: "companyNotFound" };
    }

    // updateMany returns { count: 0 } instead of throwing when nothing matches, so an
    // unchecked count is a silent HTTP 200 on a write that touched nobody.
    const updated = await prisma.appUser.updateMany({
      where: { id: userId },
      data: { role, companyId, ...contact },
    });
    if (updated.count !== 1) throw new ScopeError("not-found");

    revalidatePath("/admin/users");
    revalidatePath("/admin/companies"); // per-company user counts change
    return {};
  } catch (error) {
    return { error: scopeErrorKey(error) };
  }
}

// Activates or deactivates a user.
export async function setUserActive(input: {
  userId: string;
  active: boolean;
}): Promise<{ error?: string }> {
  const parsed = setUserActiveInput.safeParse(input);
  if (!parsed.success) return { error: "generic" };
  const { userId, active } = parsed.data;

  try {
    const scope = await resolveAdminScope();
    // Self-lockout guard: an admin cannot deactivate themselves.
    if (userId === scope.appUser.id) return { error: "cannotEditSelf" };

    // Deactivation is immediate under every provider, and always was: `active` lives in Postgres
    // rather than in a token, and every entry point re-reads it (requireAppUser redirects to
    // /account-disabled; resolveCompanyScope and resolveAdminScope throw ScopeError; the sign-in
    // action returns "accountDisabled"). So the flag alone is what enforces this.
    //
    // The sessions end too, in the same transaction as the flag, and this no longer branches on
    // the provider. It used to, on the reading that rows nothing currently honours are not this
    // action's to delete. What that missed is that AUTH_PROVIDER is one variable: a session minted
    // during a `local` window survives a rollback to `supabase` untouched, and is honoured again
    // the moment the flag goes back, up to thirty days later. So an account deactivated during the
    // Supabase window would come back with its old sessions live. Deleting them costs nothing
    // under the other two providers, which do not read these rows at all.
    //
    // destroyAllSessionsForUser is deliberately not called: it holds the app's own client, so it
    // would run outside this transaction and could purge the sessions of a flag update that then
    // rolled back. The deleted count is not checked either, because unlike a tenant-scoped write,
    // zero here just means a user who never signed in.
    await prisma.$transaction(async (tx) => {
      const updated = await tx.appUser.updateMany({ where: { id: userId }, data: { active } });
      if (updated.count !== 1) throw new ScopeError("not-found");

      // Reactivation deletes nothing. There is nothing to revoke, and any surviving row belongs
      // to the person now being let back in.
      if (!active) {
        await tx.userSession.deleteMany({ where: { userId } });
        // The reset links go with them, and for a reason the sessions do not carry: an emailed
        // link is good for one password change by whoever is holding it, and `active` does not
        // stop it being spent. requestPasswordResetAction refuses to issue a NEW link for a
        // deactivated account, which is only half the property; this is the other half. Without
        // it, an account deactivated at 10:00 can still have its password set by the holder of a
        // 09:55 link, and that attacker-chosen password is what governs the day it is
        // reactivated, silently, because nothing on the reactivation screen says otherwise.
        await tx.passwordResetToken.deleteMany({ where: { userId } });
      }
    });

    revalidatePath("/admin/users");
    return {};
  } catch (error) {
    return { error: scopeErrorKey(error) };
  }
}

// Assigns a new temporary password, so the admin can hand out fresh credentials without any email
// involved (there is no SMTP on the free tier, and a recovery mail may simply never arrive).
export async function resetUserPassword(input: {
  userId: string;
  tempPassword: string;
}): Promise<{ error?: string }> {
  const parsed = resetUserPasswordInput.safeParse(input);
  if (!parsed.success) return { error: "generic" };
  const { userId, tempPassword } = parsed.data;

  try {
    const scope = await resolveAdminScope();
    // Self-guard: regeneration exists for handing credentials to someone else, which self
    // never is. An admin changes their own password signed-in via /reset-password.
    if (userId === scope.appUser.id) return { error: "cannotEditSelf" };

    // The profile must exist; a missing one maps to the opaque "forbidden" like updateUser.
    // The address comes back too, because the throttle is keyed on it and this action has to
    // clear it (see the end of the function).
    const profile = await prisma.appUser.findUnique({
      where: { id: userId },
      select: { id: true, email: true },
    });
    if (!profile) throw new ScopeError("not-found");

    // After the guards, for the reason given in createUser.
    const { hash, algo } = await hashPassword(tempPassword);

    if (authProvider() !== "local") {
      // GoTrue decides this sign-in, so it is told first and its verdict is what the caller waits
      // on. The local write below then follows, so the column does not fall behind before the
      // cutover. A failure between the two leaves the local column holding the previous password,
      // which costs a disagreement in the shadow log and nothing more, because nothing reads it.
      //
      // What this branch still does NOT buy is an immediate lockout: GoTrue's own sessions survive
      // a rotation, so for that, deactivate the user instead.
      const supabase = createSupabaseAdminClient();
      const { error } = await supabase.auth.admin.updateUserById(userId, {
        password: tempPassword,
        email_confirm: true,
      });
      if (error) return { error: "authFailed" };
    }

    // One transaction in every provider. Rotating the password ends every session the old one
    // opened and every reset link it could still be overruled by, in the same statement that
    // writes the new hash.
    //
    // The local sweep used to be conditional on the provider, on the reading that these rows
    // decide nothing while GoTrue holds the passwords. They decide nothing UNTIL AUTH_PROVIDER
    // moves: a session or a link minted during a `local` window sits here through the whole
    // Supabase window and is honoured again the moment the flag goes back, up to thirty days
    // later. An admin who rotated a password precisely to get somebody out of an account would
    // find them still in it after a rollback and a roll-forward. Sweeping under the other two
    // providers costs nothing, because nothing there reads what is being swept.
    //
    // Not destroyAllSessionsForUser: it holds the app's own client, so it would run outside this
    // transaction and could purge the sessions of a hash write that then rolled back. The deleted
    // counts are not checked either, because unlike a tenant-scoped write, zero here just means a
    // user who never signed in and never asked for a link.
    await prisma.$transaction(async (tx) => {
      const updated = await tx.appUser.updateMany({
        where: { id: userId },
        data: { passwordHash: hash, passwordAlgo: algo },
      });
      if (updated.count !== 1) throw new ScopeError("not-found");

      await tx.userSession.deleteMany({ where: { userId } });

      // The outstanding reset links are a credential of exactly the same standing as the password
      // being replaced. Leaving them behind is what would make this rotation a half measure: an
      // admin rotates precisely because somebody else may be holding the account, and a link
      // already sitting in that mailbox stays good for one password change of the holder's
      // choosing for the rest of its hour. The admin, meanwhile, has been told the credentials are
      // now the ones they just dictated.
      await tx.passwordResetToken.deleteMany({ where: { userId } });
    });

    // The lockout has to lift with the password, in every provider, or this action does not do the
    // thing it exists for. The support call behind it is "I cannot get in": five wrong guesses put
    // a fifteen minute hold on the ADDRESS (src/lib/auth/throttle-policy.ts), the hold is checked
    // before any provider sees the credentials (signInAction), and it outlives the password it was
    // protecting. Without this the admin dictates a new password, is told it worked, and the person
    // on the phone still gets "demasiados intentos" for another quarter of an hour.
    //
    // The ADDRESS key only. An IP key is a fact about one machine working through many accounts,
    // and no single account's administrator gets to clear that on its behalf.
    await clearSignInThrottle(signInThrottleKeys(profile.email, null));

    // Nothing rendered changes (passwords are never displayed), so no revalidatePath.
    return {};
  } catch (error) {
    return { error: scopeErrorKey(error) };
  }
}

// Deletes a user's account.
export async function deleteUser(input: {
  userId: string;
}): Promise<{ error?: string }> {
  const parsed = deleteUserInput.safeParse(input);
  if (!parsed.success) return { error: "generic" };
  const { userId } = parsed.data;

  try {
    const scope = await resolveAdminScope();
    // Self-lockout guard: an admin cannot delete themselves.
    if (userId === scope.appUser.id) return { error: "cannotEditSelf" };

    if (authProvider() !== "local") {
      // Delete the AUTH user FIRST, then the profile row. The reverse order would leave a
      // login-capable auth user with no app_users profile: on their next sign in they would
      // land in onboarding and create a stray company, and because the signup trigger is
      // INSERT-only, nothing would recreate the profile row to catch them.
      const supabase = createSupabaseAdminClient();
      const { error: authError } = await supabase.auth.admin.deleteUser(userId);
      // A missing auth user (already gone) is fine: still remove the orphaned profile row.
      if (authError && !isAuthUserNotFound(authError)) return { error: "authFailed" };
    } else if (supabaseAdminConfigured()) {
      // Local mode, with GoTrue still standing. That is every deployment inside the cutover
      // window, because NEXT_PUBLIC_SUPABASE_URL is still required to boot (src/lib/env.ts), which
      // means AUTH_PROVIDER=supabase is one variable away and is meant to be a real rollback.
      //
      // A profile deleted here and left behind in GoTrue is what that rollback would resurrect:
      // an account that still signs in, with no app_users row to catch it, landing in onboarding
      // to invent a company nobody asked for. Every other loose end of this migration fails
      // closed, so it costs somebody a sign-in; this one fails OPEN, which is worth an HTTP call
      // that this branch otherwise has no use for.
      //
      // Best effort, unlike the branch above, and that difference is the point: under `local` the
      // profile row IS the account, so a GoTrue that is unreachable, or that never held this user
      // because the id was minted here, must not be able to refuse a deletion it does not decide.
      // The failure is logged and the deletion continues.
      try {
        const supabase = createSupabaseAdminClient();
        const { error: authError } = await supabase.auth.admin.deleteUser(userId);
        if (authError && !isAuthUserNotFound(authError)) {
          reportError({ where: "admin/delete-user", error: authError, context: { userId } });
        }
      } catch (error) {
        reportError({ where: "admin/delete-user", error, context: { userId } });
      }
    }

    // Under `local` this statement is the deletion that decides. The credential is a column on
    // this row, and user_sessions and password_reset_tokens are ON DELETE CASCADE, so open
    // sessions and any unused reset link go with the account instead of outliving it. The GoTrue
    // call above is housekeeping against a rollback, and is allowed to fail; this one is not.
    //
    // deleteMany rather than delete, in both branches: a missing row has to answer the opaque
    // "forbidden" that every other not-found does, and an unchecked count would report success on
    // a delete that removed nobody.
    const deleted = await prisma.appUser.deleteMany({ where: { id: userId } });
    if (deleted.count !== 1) throw new ScopeError("not-found");

    revalidatePath("/admin/users");
    revalidatePath("/admin/companies"); // per-company user counts change
    return {};
  } catch (error) {
    return { error: scopeErrorKey(error) };
  }
}
