import { revalidatePath } from "next/cache";
import type { ReportingYearScope } from "@/lib/auth/company-scope";

// The two helpers every data-entry Server Action shares. They live in their own module rather
// than in entries.ts because a "use server" file may only export async functions: exporting
// these from there would either fail the build or turn each into its own public POST endpoint.

// Both routes render the same screen from the same rows, so a write from either has to
// invalidate both: an admin editing a company's data and that company's own user can be
// looking at it at the same time.
export function revalidate(scope: ReportingYearScope) {
  revalidatePath("/data-entry");
  revalidatePath(`/admin/companies/${scope.companyId}/data-entry`);
}

// The columns every audit row shares: which year, which company, and who did it. The actor is
// taken from the resolved scope (scope.appUser), never from the client, and the email is
// denormalized so the row still names them after the account is deleted.
export function auditKey(scope: ReportingYearScope, reportingYearId: string) {
  return {
    reportingYearId,
    companyId: scope.companyId,
    changedById: scope.appUser.id,
    changedByEmail: scope.appUser.email,
  } as const;
}
