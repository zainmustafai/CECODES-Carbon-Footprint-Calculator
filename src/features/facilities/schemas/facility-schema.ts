import { z } from "zod";

type T = (key: string) => string;

export const createFacilityInput = z
  .object({
    companyId: z.uuid(),
    name: z.string().trim().min(1).max(160),
    location: z.string().trim().min(1).max(160),
  })
  .strict();

export const updateFacilityInput = z
  .object({
    facilityId: z.uuid(),
    name: z.string().trim().min(1).max(160),
    location: z.string().trim().min(1).max(160),
  })
  .strict();

export function facilityFormSchema(t: T) {
  return z.object({
    name: z.string().trim().min(1, t("nameRequired")).max(160),
    location: z.string().trim().min(1, t("locationRequired")).max(160),
  });
}

export type FacilityFormValues = z.infer<ReturnType<typeof facilityFormSchema>>;
