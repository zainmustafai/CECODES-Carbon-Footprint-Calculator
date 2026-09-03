import { z } from "zod";
import {
  DECIMAL_30_10,
  DECIMAL_MONEY_INPUT,
  isValidFactorValue,
  normalizeDecimalInput,
  roundDecimalString,
} from "@/lib/decimal-input";

// Schemas for the admin factor library.
//
// Two layers, per the project convention: the SERVER schemas are `.strict()` and never
// trust the client. The CLIENT factories take a translator so validation messages are
// localized. Every emission factor and its Decimal columns cross the wire as STRINGS: a
// Decimal(30,10) cannot survive a round trip through a JavaScript number.

type T = (key: string) => string;

// ---------------------------------------------------------------------------
// Server side. All `.strict()`. Errors are opaque; the message strings below are
// developer facing only, because a failed server parse maps to the generic error key.
// ---------------------------------------------------------------------------

// A Decimal(30,10) column. "" means "this factor does not carry this value" and is stored
// as NULL. Otherwise the Colombian comma is normalized to a dot and the value must fit the
// column, or Postgres would reject it at the driver.
const decimalOrNull = z
  .string()
  .transform((value) => normalizeDecimalInput(value.trim()))
  .refine((value) => value === "" || DECIMAL_30_10.test(value), {
    message: "decimalInvalid",
  })
  .transform((value) => (value === "" ? null : value));

// A trimmed optional string that stores "" as NULL.
const optionalString = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === "" ? null : value));

// The GWP set is a nullable enum: "" means "not specified".
const gwpOrNull = z
  .string()
  .transform((value) => value.trim())
  .refine((value) => value === "" || value === "AR5" || value === "AR6", {
    message: "gwpInvalid",
  })
  .transform((value) => (value === "" ? null : (value as "AR5" | "AR6")));

// A year is an Int identity, not a decimal quantity, so it is safe to Number() here.
const yearOrNull = z
  .string()
  .transform((value) => value.trim())
  .refine((value) => value === "" || /^\d{1,4}$/.test(value), { message: "yearInvalid" })
  .transform((value) => (value === "" ? null : Number(value)));

// The shared field shape, reused by create and update so the two never drift.
const factorFieldsShape = {
  scope: z.enum(["SCOPE_1", "SCOPE_2", "SCOPE_3"]),
  category: z.string().trim().min(1).max(200),
  subcategory: optionalString(200),
  element: z.string().trim().min(1).max(300),
  unit: z.string().trim().min(1).max(120),
  co2Factor: decimalOrNull,
  ch4Factor: decimalOrNull,
  n2oFactor: decimalOrNull,
  co2eFactor: decimalOrNull,
  co2eFactorCop: decimalOrNull,
  co2eFactorUsd: decimalOrNull,
  factorUnit: optionalString(120),
  source: optionalString(2000),
  gwpSet: gwpOrNull,
  biogenic: z.boolean(),
  uncertaintyPct: decimalOrNull,
  effectiveYear: yearOrNull,
  active: z.boolean(),
};

export const createFactorInput = z.object(factorFieldsShape).strict();

export const updateFactorInput = z
  .object({ factorId: z.uuid(), ...factorFieldsShape })
  .strict();

export const setFactorActiveInput = z
  .object({ factorId: z.uuid(), active: z.boolean() })
  .strict();

export const createVersionInput = z
  .object({
    version: z.string().trim().min(1).max(60),
    date: z.string().trim().min(1),
    preparedBy: optionalString(160),
    reviewedBy: optionalString(160),
    authorizedBy: optionalString(160),
    description: optionalString(2000),
  })
  .strict();

export const upsertGridFactorInput = z
  .object({
    year: z.coerce.number().int().min(1990).max(2100),
    factor: z
      .string()
      .transform((value) => normalizeDecimalInput(value.trim()))
      .refine((value) => DECIMAL_30_10.test(value), { message: "decimalInvalid" }),
    source: optionalString(200),
    // "create" makes the action refuse a year that already exists instead of silently
    // overwriting it; "edit" (or absent) keeps the plain upsert.
    mode: z.enum(["create", "edit"]).optional(),
  })
  .strict();

export const deleteGridFactorInput = z
  .object({ year: z.coerce.number().int().min(1990).max(2100) })
  .strict();

// Which fuel a price is for. A year carries one gasoline price and one diesel price, and the
// engine divides a reported amount by the price of the fuel its factor names (client feedback
// 2026-09-03). The fuel is half the key, so it is required on the write AND on the delete.
const subsidyFuel = z.enum(["GASOLINE", "DIESEL"]);

// Average price per gallon (COP), by year and fuel - Scope 3 Cat 6 "Subsidios de transporte"
// (client feedback 2026-08-15). Same shape and same create/edit convention as the grid factor.
export const upsertSubsidyPriceInput = z
  .object({
    year: z.coerce.number().int().min(1990).max(2100),
    fuel: subsidyFuel,
    // Decimal(20, 6) in the column, but the INPUT takes any number of decimals and is rounded
    // here to fit. The two-decimal rule this replaced rejected CECODES's own national averages
    // outright: their 2024 gasoline figure is 16046.315789473685, twelve decimals, and an admin
    // has to be able to paste the number the client sent instead of truncating it by hand.
    pricePerGallonCop: z
      .string()
      .transform((value) => normalizeDecimalInput(value.trim()))
      .refine((value) => DECIMAL_MONEY_INPUT.test(value), { message: "decimalInvalid" })
      .transform((value) => roundDecimalString(value, 6)),
    source: optionalString(200),
    mode: z.enum(["create", "edit"]).optional(),
  })
  .strict();

export const deleteSubsidyPriceInput = z
  .object({
    year: z.coerce.number().int().min(1990).max(2100),
    fuel: subsidyFuel,
  })
  .strict();

// ---------------------------------------------------------------------------
// Client factories. These drive React Hook Form and produce localized messages.
// The values stay strings; the server re-validates and null-ifies.
// ---------------------------------------------------------------------------

const clientDecimal = (t: T) =>
  z.string().refine((value) => isValidFactorValue(value), t("decimalInvalid"));

// A plain Set membership check, not `value === "SCOPE_1" || ...`. Literal equality would let
// Zod narrow the output type to the union, so the form's input type (a plain string, "" when
// unset) would diverge from the schema's output and fail to typecheck against the resolver.
const SCOPE_VALUES = new Set(["SCOPE_1", "SCOPE_2", "SCOPE_3"]);

export function factorFormSchema(t: T) {
  return z
    .object({
      scope: z.string().refine((value) => SCOPE_VALUES.has(value), t("scopeRequired")),
      category: z.string().trim().min(1, t("categoryRequired")).max(200),
      subcategory: z.string().trim().max(200),
      element: z.string().trim().min(1, t("elementRequired")).max(300),
      unit: z.string().trim().min(1, t("unitRequired")).max(120),
      co2Factor: clientDecimal(t),
      ch4Factor: clientDecimal(t),
      n2oFactor: clientDecimal(t),
      co2eFactor: clientDecimal(t),
      co2eFactorCop: clientDecimal(t),
      co2eFactorUsd: clientDecimal(t),
      factorUnit: z.string().trim().max(120),
      source: z.string().trim().max(2000),
      gwpSet: z.string(),
      biogenic: z.boolean(),
      uncertaintyPct: clientDecimal(t),
      effectiveYear: z
        .string()
        .trim()
        .refine((value) => value === "" || /^\d{1,4}$/.test(value), t("yearInvalid")),
      active: z.boolean(),
    })
    .superRefine((values, ctx) => {
      // The Scope 2 electricity element carries no factor by design: its factor lives in
      // grid_electricity_factors, by year. Every other factor needs at least one value.
      if (values.scope === "SCOPE_2") return;
      const hasFactor = [
        values.co2Factor,
        values.ch4Factor,
        values.n2oFactor,
        values.co2eFactor,
        values.co2eFactorCop,
        values.co2eFactorUsd,
      ].some((value) => normalizeDecimalInput(value) !== "");
      if (!hasFactor) {
        ctx.addIssue({
          code: "custom",
          message: t("factorRequired"),
          path: ["co2eFactor"],
        });
      }
    });
}

export type FactorFormValues = z.infer<ReturnType<typeof factorFormSchema>>;

export function versionFormSchema(t: T) {
  return z.object({
    version: z.string().trim().min(1, t("versionRequired")).max(60),
    date: z.string().trim().min(1, t("dateRequired")),
    preparedBy: z.string().trim().max(160),
    reviewedBy: z.string().trim().max(160),
    authorizedBy: z.string().trim().max(160),
    description: z.string().trim().max(2000),
  });
}

export type VersionFormValues = z.infer<ReturnType<typeof versionFormSchema>>;

export function gridFactorFormSchema(t: T) {
  return z.object({
    year: z
      .string()
      .trim()
      .refine((value) => {
        if (!/^\d{4}$/.test(value)) return false;
        const year = Number(value);
        return year >= 1990 && year <= 2100;
      }, t("yearInvalid")),
    factor: z
      .string()
      .refine(
        (value) => normalizeDecimalInput(value) !== "" && isValidFactorValue(value),
        t("decimalInvalid"),
      ),
    source: z.string().trim().max(200),
  });
}

export type GridFactorFormValues = z.infer<ReturnType<typeof gridFactorFormSchema>>;

export function subsidyPriceFormSchema(t: T) {
  return z.object({
    year: z
      .string()
      .trim()
      .refine((value) => {
        if (!/^\d{4}$/.test(value)) return false;
        const year = Number(value);
        return year >= 1990 && year <= 2100;
      }, t("yearInvalid")),
    // Unlike `scope` in factorFormSchema this narrows safely: the Select always holds one of
    // the two values, so the form's input type never has to represent an unset "".
    fuel: subsidyFuel,
    // Mirrors the server rule: the extra decimals are accepted here and rounded there, so
    // pasting a spreadsheet average does not light up a validation error the admin cannot act on.
    pricePerGallonCop: z
      .string()
      .refine(
        (value) =>
          normalizeDecimalInput(value) !== "" &&
          DECIMAL_MONEY_INPUT.test(normalizeDecimalInput(value)),
        t("decimalInvalid"),
      ),
    source: z.string().trim().max(200),
  });
}

export type SubsidyPriceFormValues = z.infer<ReturnType<typeof subsidyPriceFormSchema>>;
