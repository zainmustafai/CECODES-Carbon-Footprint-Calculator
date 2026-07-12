import { Prisma } from "@/lib/generated/prisma/client";

// The field diff stored on EmissionFactorChange.changes, and rendered by FactorHistory.
//
// Shared by the admin actions and by prisma/import-factors.ts, so an imported change and a
// hand edit produce the same shape. Everything is compared and stored as a STRING: a
// Decimal(30,10) cannot survive a round trip through a JavaScript number, and JSON has no
// decimal type.

export const FACTOR_FIELDS = [
  "scope",
  "category",
  "subcategory",
  "element",
  "unit",
  "co2Factor",
  "ch4Factor",
  "n2oFactor",
  "co2eFactor",
  "co2eFactorCop",
  "co2eFactorUsd",
  "factorUnit",
  "source",
  "gwpSet",
  "biogenic",
  "uncertaintyPct",
  "effectiveYear",
  "active",
] as const;

export type FactorField = (typeof FACTOR_FIELDS)[number];

// Which fields hold a Decimal. "10.100" and "10.1" are the same number and must not be
// recorded as a change, or every importer run would rewrite the whole library.
const DECIMAL_FIELDS = new Set<FactorField>([
  "co2Factor",
  "ch4Factor",
  "n2oFactor",
  "co2eFactor",
  "co2eFactorCop",
  "co2eFactorUsd",
  "uncertaintyPct",
]);

export type FactorSnapshot = Partial<Record<FactorField, unknown>>;
export type FactorDiff = Partial<Record<FactorField, { from: string | null; to: string | null }>>;

// Prisma Decimals, booleans, numbers and nulls all normalize to a string or null here.
export function toComparable(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "boolean") return value ? "true" : "false";
  if (value instanceof Prisma.Decimal) return value.toString();
  return String(value);
}

function decimalEquals(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return a === b;
  try {
    return new Prisma.Decimal(a).eq(new Prisma.Decimal(b));
  } catch {
    return a === b;
  }
}

function fieldEquals(field: FactorField, a: string | null, b: string | null): boolean {
  return DECIMAL_FIELDS.has(field) ? decimalEquals(a, b) : a === b;
}

/**
 * Fields that actually differ. An empty object means "nothing changed", which the update
 * action treats as a no-op rather than writing a meaningless audit row.
 */
export function buildFactorDiff(before: FactorSnapshot, after: FactorSnapshot): FactorDiff {
  const diff: FactorDiff = {};

  for (const field of FACTOR_FIELDS) {
    if (!(field in after)) continue; // the caller is not changing this field

    const from = toComparable(before[field]);
    const to = toComparable(after[field]);
    if (!fieldEquals(field, from, to)) diff[field] = { from, to };
  }

  return diff;
}

/** The whole state as a diff from nothing. Used for CREATED and IMPORTED rows. */
export function buildCreationDiff(after: FactorSnapshot): FactorDiff {
  const diff: FactorDiff = {};

  for (const field of FACTOR_FIELDS) {
    const to = toComparable(after[field]);
    if (to !== null) diff[field] = { from: null, to };
  }

  return diff;
}

export function isEmptyDiff(diff: FactorDiff): boolean {
  return Object.keys(diff).length === 0;
}
