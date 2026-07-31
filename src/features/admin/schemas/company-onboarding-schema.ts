import { z } from "zod";
import {
  MIN_REPORTING_YEAR,
  maxReportingYear,
} from "@/features/data-entry/schemas/reporting-year-schema";

// Client schema for the new-company wizard. The four underlying server actions
// (createCompany, createFacility, createReportingYear, createUser) each re-validate with
// their own strict schemas; this only drives the form. The sede, the first reporting year,
// and the first user are all optional, but each is internally all-or-nothing: a sede name
// with no location, a year with no sede, or a password with no email is a mistake worth
// catching before the admin submits.
type T = (key: string) => string;

const EMAIL = z.string().trim().toLowerCase().pipe(z.email());

export function companyOnboardingSchema(t: T) {
  return z
    .object({
      companyName: z.string().trim().min(1, t("companyNameRequired")).max(160),
      // Optional, matching the DB column and the edit dialog ("Sector (opcional)"). The
      // wizard used to be the lone place that required it.
      sector: z.string().trim().max(160),
      contactEmail: z.string().trim().max(200),
      facilityName: z.string().trim().max(160),
      facilityLocation: z.string().trim().max(160),
      // A string because the box may be empty ("" = no first year); numeric rules live in
      // the superRefine below.
      year: z.string().trim(),
      userEmail: z.string().trim().max(200),
      userPassword: z.string().max(200),
    })
    .superRefine((value, ctx) => {
      if (value.contactEmail.length > 0 && !EMAIL.safeParse(value.contactEmail).success) {
        ctx.addIssue({
          code: "custom",
          message: t("contactEmailInvalid"),
          path: ["contactEmail"],
        });
      }

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

      // ReportingYear hangs off Facility in the schema, so a year without a sede has nowhere
      // to live. The step's UI already explains this; the rule is the backstop.
      if (value.year.length > 0) {
        const hasFacility = hasFacilityName && hasFacilityLocation;
        if (!hasFacility) {
          ctx.addIssue({
            code: "custom",
            message: t("yearRequiresFacility"),
            path: ["year"],
          });
        } else if (!/^\d+$/.test(value.year)) {
          ctx.addIssue({ code: "custom", message: t("yearInvalid"), path: ["year"] });
        } else {
          const year = Number(value.year);
          if (year < MIN_REPORTING_YEAR) {
            ctx.addIssue({ code: "custom", message: t("yearMin"), path: ["year"] });
          } else if (year > maxReportingYear()) {
            ctx.addIssue({ code: "custom", message: t("yearMax"), path: ["year"] });
          }
        }
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
  ["companyName", "sector", "contactEmail"],
  ["facilityName", "facilityLocation"],
  ["year"],
  ["userEmail", "userPassword"],
];
