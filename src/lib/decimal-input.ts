// Decimal handling for every numeric text input in the app.
//
// Quantities and factors are Postgres NUMERIC and Prisma Decimal. They are strings from the
// input element all the way to the server action. They never become a JavaScript number:
// float64 cannot represent the values the old prototype destroyed.
//
// This module used to live inside the data-entry feature. It moved here when the admin
// factor forms needed the same rules against a wider column type.

// Decimal(20, 6): at most 14 integer digits and 6 fractional digits, non-negative.
// Postgres silently rounds a 7th decimal but raises 22003 past 14 integer digits, so both
// are caught here rather than at the driver. No sign, no exponent: this rejects "-5",
// "1e400", "Infinity", "NaN" and "abc" by construction.
export const DECIMAL_20_6 = /^\d{1,14}(\.\d{1,6})?$/;

// Decimal(30, 10): the emission-factor columns. Same rules, wider bounds.
export const DECIMAL_30_10 = /^\d{1,20}(\.\d{1,10})?$/;

// Colombian keyboards produce a decimal comma. Spaces arrive in pasted values, including
// the non-breaking and narrow-no-break spaces Excel and Word emit as thousands separators.
// JavaScript's \s already matches U+00A0 and U+202F, so one class covers all of them. It is
// spelled \s on purpose: the previous version carried an invisible literal NBSP in source.
export function normalizeDecimalInput(raw: string): string {
  return raw.replace(/\s/g, "").replace(",", ".");
}

// "" means "not reported", which is stored as NULL. It is not the same as 0.
export function isValidEntryValue(raw: string): boolean {
  const normalized = normalizeDecimalInput(raw);
  return normalized === "" || DECIMAL_20_6.test(normalized);
}

// Factor fields. Empty means "this source does not emit this gas", stored as NULL.
export function isValidFactorValue(raw: string): boolean {
  const normalized = normalizeDecimalInput(raw);
  return normalized === "" || DECIMAL_30_10.test(normalized);
}
