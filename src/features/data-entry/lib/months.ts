export const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

export type Month = (typeof MONTHS)[number];

export function isMonth(value: number): value is Month {
  return Number.isInteger(value) && value >= 1 && value <= 12;
}

// Scope 2 (electricity) is captured monthly; Scopes 1 and 3 are a single annual value.
// The database enforces this too (activity_entries_month_scope_check).
export function isMonthly(scope: string): boolean {
  return scope === "SCOPE_2";
}

export function monthsForScope(scope: string): readonly (number | null)[] {
  return isMonthly(scope) ? MONTHS : [null];
}
