import { z } from "zod";

// Client schema for the new-company wizard. The three underlying server actions
// (createCompany, createFacility, createUser) each re-validate with their own strict schemas;
// this only drives the form. The facility and the first user are both optional, but each is
// all-or-nothing: a name with no location, or a password with no email, is a mistake worth
// catching before the admin submits.
type T = (key: string) => string;

const EMAIL = z.string().trim().toLowerCase().pipe(z.email());

export function companyOnboardingSchema(t: T) {
  return z
    .object({
      companyName: z.string().trim().min(1, t("companyNameRequired")).max(160),
      sector: z.string().trim().min(1, t("sectorRequired")).max(160),
      facilityName: z.string().trim().max(160),
      facilityLocation: z.string().trim().max(160),
      userEmail: z.string().trim().max(200),
      userPassword: z.string().max(200),
    })
    .superRefine((value, ctx) => {
      const hasFacilityName = value.facilityName.length > 0;
      const hasFacilityLocation = value.facilityLocation.length > 0;
      if (hasFacilityName && !hasFacilityLocation) {
        ctx.addIssue({
          code: "custom",
          message: t("facilityLocationRequired"),
          path: ["facilityLocation"],
        });
      }
      if (hasFacilityLocation && !hasFacilityName) {
        ctx.addIssue({
          code: "custom",
          message: t("facilityNameRequired"),
          path: ["facilityName"],
        });
      }

      const hasEmail = value.userEmail.length > 0;
      const hasPassword = value.userPassword.length > 0;
      if (hasEmail && !EMAIL.safeParse(value.userEmail).success) {
        ctx.addIssue({ code: "custom", message: t("emailInvalid"), path: ["userEmail"] });
      }
      if (hasEmail && value.userPassword.length < 8) {
        ctx.addIssue({ code: "custom", message: t("passwordMin"), path: ["userPassword"] });
      }
      if (hasPassword && !hasEmail) {
        ctx.addIssue({ code: "custom", message: t("emailRequired"), path: ["userEmail"] });
      }
    });
}

export type CompanyOnboardingValues = z.infer<ReturnType<typeof companyOnboardingSchema>>;

// The fields each wizard step owns, so the hook can validate one step before advancing.
export const ONBOARDING_STEP_FIELDS: (keyof CompanyOnboardingValues)[][] = [
  ["companyName", "sector"],
  ["facilityName", "facilityLocation"],
  ["userEmail", "userPassword"],
];
