import type { FuelType } from "@/lib/generated/prisma/client";

// Which fuel a Scope 3 C6 "Subsidios de transporte" factor buys, and which of the year's average
// prices the reported money is divided by.
//
// The company reports an amount of money (COP); the engine divides it by that year's average
// price per gallon to get gallons, then prices the gallons with the normal per-gallon factor.
// Until 2026-09-03 there was ONE price per year and both the gasoline and the diesel factor
// divided by it, so diesel was silently charged the gasoline price. The official Emission Factors
// sheet has exactly two such elements, both with unit "gal":
//
//   C6: Gasolina E10 (Comercial) - Movil
//   C6: Diesel B10 (Mezcla comercial) - Movil
//
// The derivation lives here, in one place, because it has two callers that must never disagree:
// prisma/import-factors.ts, which stamps EmissionFactor.fuelType on every run so a renamed row
// cannot lose it, and the app, which reads that column. Matching on the element name is
// acceptable ONLY as the derivation that fills the typed column. Nothing downstream matches on
// names: migration 20260815120000 already recorded why that would be fragile.

export type { FuelType };

export type FuelPrices = { GASOLINE: string | null; DIESEL: string | null };

// Accent-insensitive: the workbook writes "Diesel" with an accent, a future revision may not.
const DIESEL = /di[eé]sel/i;
const GASOLINE = /gasolina/i;

export function deriveFuelType(row: { entryMode: string; element: string }): FuelType | null {
  if (row.entryMode !== "MONEY_PER_GALLON") return null;
  if (DIESEL.test(row.element)) return "DIESEL";
  if (GASOLINE.test(row.element)) return "GASOLINE";
  // A money-per-gallon factor for some other fuel: leave it unidentified rather than defaulting
  // to gasoline. The engine then reports a missing price, which is visible, instead of pricing
  // the entry against the wrong fuel, which is not.
  return null;
}

export function priceForFuel(prices: FuelPrices | null, fuel: FuelType | null): string | null {
  if (!prices || fuel === null) return null;
  return prices[fuel];
}

/**
 * Folds a year's price rows into the two-slot shape the engine takes. A fuel with no row for that
 * year stays null, which the engine reports as a missing price rather than substituting the other
 * fuel's number.
 *
 * Decimals cross the RSC boundary as strings, so `pricePerGallonCop` is stringified here and
 * never passed through Number().
 */
export function toFuelPrices(
  rows: { fuel: FuelType; pricePerGallonCop: { toString(): string } }[],
): FuelPrices {
  const prices: FuelPrices = { GASOLINE: null, DIESEL: null };
  for (const row of rows) prices[row.fuel] = row.pricePerGallonCop.toString();
  return prices;
}

/**
 * The gallons a money amount buys, or null when the year has no usable price for that fuel.
 *
 * Zero is treated as "no usable price", not as a number to divide by: the admin form accepts "0"
 * and dividing by it would produce Infinity, which propagates into the year's total as Infinity
 * or NaN with nothing flagged. A missing price is load-bearing, disclosed state; a fabricated
 * total is not.
 */
export function gallonsFromMoney(
  moneyCop: number,
  prices: FuelPrices | null,
  fuel: FuelType | null,
): number | null {
  const price = priceForFuel(prices, fuel);
  if (price === null) return null;
  const parsed = Number(price);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return moneyCop / parsed;
}
