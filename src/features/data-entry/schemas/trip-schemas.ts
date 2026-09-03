import { z } from "zod";
import { DECIMAL_20_6, normalizeDecimalInput } from "@/lib/decimal-input";

// A trip's count and distance are REQUIRED, unlike ActivityEntry.value: an empty row is never
// sent at all, so there is no "not reported" state to represent here. Zero is allowed (a
// reported zero is an answer); a negative one is not, and DECIMAL_20_6 admits no sign to begin
// with, so "-3" fails on the same rule that catches "abc".
//
// Exported because the trip table marks exactly the rows the server would reject, rather than
// letting the user type a number that quietly never leaves the browser.
export function isValidTripNumber(raw: string): boolean {
  const normalized = normalizeDecimalInput(raw.trim());
  return normalized !== "" && DECIMAL_20_6.test(normalized);
}

const tripNumber = z
  .string()
  .transform((value) => normalizeDecimalInput(value.trim()))
  .refine(isValidTripNumber, { message: "decimalInvalid" });

// "" is what an untouched input posts and it means "not provided", which is NULL rather than an
// empty string: the table and the exports test these fields with plain truthiness, so a stored
// "" would render as nothing while leaving a dirty row behind.
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value): string | null => (value === "" ? null : value));

export const saveTransportTripsInput = z
  .object({
    reportingYearId: z.uuid(),
    entryId: z.uuid(),
    trips: z
      .array(
        z
          .object({
            reference: optionalText(200),
            count: tripNumber,
            distanceKm: tripNumber,
            note: optionalText(500),
          })
          .strict(),
      )
      // An empty array is meaningful rather than a no-op: it clears the source back to "not
      // reported". 200 is a generous ceiling on one company's routes for one source in one year,
      // and it bounds the transaction the action opens.
      .max(200),
  })
  .strict();
