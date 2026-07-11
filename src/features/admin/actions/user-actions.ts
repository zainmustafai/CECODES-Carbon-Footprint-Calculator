"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import {
  ScopeError,
  resolveAdminScope,
  scopeErrorKey,
} from "@/lib/auth/company-scope";
import {
  createSupabaseAdminClient,
  findAuthUserIdByEmail,
} from "@/lib/supabase/admin";
import {
  createUserInput,
  updateUserInput,
  setUserActiveInput,
  deleteUserInput,
} from "../schemas/user-schemas";

// app_users.email is a Prisma-owned @unique, so a collision surfaces as P2002. The raw driver
// code "23505" is included for parity with the rest of the codebase's uniqueness checks.
function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("code" in error)) return false;
  const code = (error as { code?: string }).code;
  return code === "P2002" || code === "23505";
}

// Whether a Supabase auth error means the email is already registered. The admin API returns
// this in several shapes across versions, so match on both the code and the message.
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
function isAuthUserNotFound(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const status = (error as { status?: number }).status;
  const code = (error as { code?: string }).code;
  return status === 404 || code === "user_not_found";
}

// Creates a real Supabase auth user plus its app_users profile. The admin sets a temporary
// password and email_confirm skips the verification email, so the person can sign in at once.
// There are no invite emails and no SMTP dependency.
export async function createUser(input: {
  email: string;
  tempPassword: string;
  role: "COMPANY_USER" | "CECODES_ADMIN";
  companyId?: string | null;
}): Promise<{ error?: string; userId?: string }> {
  const parsed = createUserInput.safeParse(input);
  if (!parsed.success) return { error: "generic" };
  const { email, tempPassword, role } = parsed.data;
  // An admin owns no company; force the invariant here too, never only in the schema.
  const companyId = role === "CECODES_ADMIN" ? null : parsed.data.companyId ?? null;

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
    let userId: string | undefined;

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
        userId = await findAuthUserIdByEmail(supabase, email);
      }
      if (!userId) return { error: "authFailed" };
    } else {
      userId = data.user?.id;
    }
    if (!userId) return { error: "authFailed" };

    // 4. app_users.id MUST equal the auth user id. The signup trigger already inserted a row
    //    with role COMPANY_USER, ON CONFLICT (id) DO NOTHING, and it NEVER updates. Upsert to
    //    force the role and companyId the admin chose (and to create the row on the repair
    //    path, where the trigger never fired).
    await prisma.appUser.upsert({
      where: { id: userId },
      update: { email, role, companyId, active: true },
      create: { id: userId, email, role, companyId, active: true },
    });

    revalidatePath("/admin/users");
    revalidatePath("/admin/companies"); // per-company user counts change
    return { userId };
  } catch (error) {
    if (isUniqueViolation(error)) return { error: "emailInUse" };
    return { error: scopeErrorKey(error) };
  }
}

// Changes a user's role and company. Email and the password are not editable here.
export async function updateUser(input: {
  userId: string;
  role: "COMPANY_USER" | "CECODES_ADMIN";
  companyId?: string | null;
}): Promise<{ error?: string }> {
  const parsed = updateUserInput.safeParse(input);
  if (!parsed.success) return { error: "generic" };
  const { userId, role } = parsed.data;
  const companyId = role === "CECODES_ADMIN" ? null : parsed.data.companyId ?? null;

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
      data: { role, companyId },
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

    const updated = await prisma.appUser.updateMany({
      where: { id: userId },
      data: { active },
    });
    if (updated.count !== 1) throw new ScopeError("not-found");

    // No Supabase session revocation is performed, and none is needed. `active` (and `role`)
    // live in Postgres, not in the JWT, and every request re-reads them: a deactivated user's
    // very next request is refused (requireAppUser redirects to /account-disabled;
    // resolveCompanyScope and resolveAdminScope throw ScopeError; signInAction returns
    // "accountDisabled"). supabase-js exposes no by-user-id session revocation.
    revalidatePath("/admin/users");
    return {};
  } catch (error) {
    return { error: scopeErrorKey(error) };
  }
}

// Deletes a user's auth account and profile row.
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

    // Delete the AUTH user FIRST, then the profile row. The reverse order would leave a
    // login-capable auth user with no app_users profile: on their next sign in they would
    // land in onboarding and create a stray company, and because the signup trigger is
    // INSERT-only, nothing would recreate the profile row to catch them.
    const supabase = createSupabaseAdminClient();
    const { error: authError } = await supabase.auth.admin.deleteUser(userId);
    // A missing auth user (already gone) is fine: still remove the orphaned profile row.
    if (authError && !isAuthUserNotFound(authError)) return { error: "authFailed" };

    const deleted = await prisma.appUser.deleteMany({ where: { id: userId } });
    if (deleted.count !== 1) throw new ScopeError("not-found");

    revalidatePath("/admin/users");
    revalidatePath("/admin/companies"); // per-company user counts change
    return {};
  } catch (error) {
    return { error: scopeErrorKey(error) };
  }
}
