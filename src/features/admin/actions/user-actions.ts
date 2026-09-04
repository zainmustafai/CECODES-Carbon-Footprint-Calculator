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
import {
  createUserInput,
  updateUserInput,
  setUserActiveInput,
  deleteUserInput,
  resetUserPasswordInput,
} from "../schemas/user-schemas";

// Admin user management, backed by one credential store: the password is a column on app_users,
// in the same database as the profile, and every write here is a Postgres statement. The guards
// do not vary by action: resolveAdminScope first, then the self-edit refusals, then a checked row
// count on every write.

// app_users.email is a Prisma-owned @unique, so a collision surfaces as P2002. The raw driver
// code "23505" is included for parity with the rest of the codebase's uniqueness checks.
function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("code" in error)) return false;
  const code = (error as { code?: string }).code;
  return code === "P2002" || code === "23505";
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
    // and no confirmation mail to wait for, so it is confirmed at creation.
    const credentials = { passwordHash: hash, passwordAlgo: algo, emailConfirmedAt: new Date() };

    // ONE INSERT, credential and profile as columns of the same row: there is no window between
    // "account exists" and "profile exists" for a failure to land inside, so it commits whole or
    // not at all. A collision on the unique email index raises P2002, which the catch below
    // reports as emailInUse.
    const userId = crypto.randomUUID();
    await prisma.appUser.create({
      data: { id: userId, email, role, companyId, active: true, ...credentials, ...contact },
    });

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

    // One transaction: rotating the password ends every session the old one opened and every
    // reset link it could still be overruled by, in the same statement that writes the new hash.
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

    // The lockout has to lift with the password, or this action does not do the thing it exists
    // for. The support call behind it is "I cannot get in": five wrong guesses put a fifteen
    // minute hold on the ADDRESS (src/lib/auth/throttle-policy.ts), the hold is checked before
    // the password is (signInAction), and it outlives the password it was protecting. Without
    // this the admin dictates a new password, is told it worked, and the person on the phone
    // still gets "demasiados intentos" for another quarter of an hour.
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

    // This statement is the whole deletion. The credential is a column on this row, and
    // user_sessions and password_reset_tokens are ON DELETE CASCADE, so open sessions and any
    // unused reset link go with the account instead of outliving it.
    //
    // deleteMany rather than delete: a missing row has to answer the opaque "forbidden" that
    // every other not-found does, and an unchecked count would report success on a delete that
    // removed nobody.
    const deleted = await prisma.appUser.deleteMany({ where: { id: userId } });
    if (deleted.count !== 1) throw new ScopeError("not-found");

    revalidatePath("/admin/users");
    revalidatePath("/admin/companies"); // per-company user counts change
    return {};
  } catch (error) {
    return { error: scopeErrorKey(error) };
  }
}
