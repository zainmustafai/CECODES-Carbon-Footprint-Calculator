import { z } from "zod";

// Translator for the "onboarding.validation" namespace.
type T = (key: string) => string;

export function onboardingSchema(t: T) {
  return z.object({
    companyName: z.string().min(1, t("companyNameRequired")),
    sector: z.string().optional(),
    facilityName: z.string().min(1, t("facilityNameRequired")),
    facilityLocation: z.string().min(1, t("facilityLocationRequired")),
  });
}

export type OnboardingValues = z.infer<ReturnType<typeof onboardingSchema>>;
