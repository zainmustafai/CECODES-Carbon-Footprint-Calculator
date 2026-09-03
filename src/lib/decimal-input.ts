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

// A money amount AS TYPED, before it is fitted to its column: up to 14 integer digits and any
// number of decimals.
//
// The transport-subsidy price needs this because the source of the number is a spreadsheet
// average, not a keyboard: CECODES's own 2024 gasoline figure is 16046.315789473685, twelve
// decimals. Refusing it would mean the admin cannot paste the number the client actually sent,
// over a difference of five ten-millionths of a peso. So the input accepts the full precision
// and roundDecimalString fits it to the column instead.
export const DECIMAL_MONEY_INPUT = /^\d{1,14}(\.\d+)?$/;

/**
 * Rounds a decimal string to `scale` places, half away from zero, entirely in string arithmetic.
 *
 * Never through a float: Number("16046.315789473685").toFixed(6) happens to be right, but the
 * same round trip is not safe for the 14-digit values this column allows, and this codebase's
 * one rule about Decimals is that they never become JavaScript numbers.
 *
 * Assumes `value` already matched DECIMAL_MONEY_INPUT, so it is non-negative and has no sign or
 * exponent; half-up and half-away-from-zero therefore agree.
 */
export function roundDecimalString(value: string, scale: number): string {
  const [int = "0", frac = ""] = value.split(".");
  if (frac.length <= scale) return value;

  const keep = frac.slice(0, scale);
  if (Number(frac[scale]) < 5) return scale === 0 ? int : `${int}.${keep}`;

  // Round up: increment the kept digits as one integer so a carry crosses the decimal point
  // correctly ("9.9999995" at scale 6 becomes "10.000000", not "9.1000000").
  const digits = `${int}${keep}`.split("");
  for (let i = digits.length - 1; ; i -= 1) {
    if (i < 0) {
      digits.unshift("1");
      break;
    }
    const next = Number(digits[i]) + 1;
    if (next < 10) {
      digits[i] = String(next);
      break;
    }
    digits[i] = "0";
  }

  const joined = digits.join("");
  const cut = joined.length - scale;
  return scale === 0 ? joined : `${joined.slice(0, cut)}.${joined.slice(cut)}`;
}

// Colombian keyboards produce a decimal comma. Spaces arrive in pasted values, including
// the non-breaking and narrow-no-break spaces Excel and Word emit as thousands separators.
// JavaScript's \s already matches U+00A0 and U+202F, so one class covers all of them. It is
// spelled \s on purpose: the previous version carried an invisible literal NBSP in source.
//
// Dot-grouped thousands ("1.234.567" or "1.234,56", the dominant es-CO convention) are
// stripped, but ONLY when the pattern is unambiguous: the value also contains a comma, or it
// carries more than one dot group. A bare "12.345" stays a dot-decimal, because rewriting it
// to twelve thousand would silently change the meaning of input this field has always
// accepted; the visible validation error and the live estimate are the guard for that case.
export function normalizeDecimalInput(raw: string): string {
  let text = raw.replace(/\s/g, "");

  const dotGrouped = /^\d{1,3}(\.\d{3})+(,\d+)?$/.test(text);
  if (dotGrouped && (text.includes(",") || text.indexOf(".") !== text.lastIndexOf("."))) {
    text = text.replace(/\./g, "");
  }

  return text.replace(",", ".");
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
