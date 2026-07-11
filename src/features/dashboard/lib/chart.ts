import type { Scope } from "@/lib/generated/prisma/client";

// The scope-to-colour mapping is fixed across the whole product (DESIGN.md): Alcance 1 green,
// Alcance 2 amber, Alcance 3 blue. Everything that draws a scope uses these, so the donut,
// the legend, the category bars and the target bars stay consistent.
export const SCOPE_COLOR: Record<Scope, string> = {
  SCOPE_1: "var(--chart-1)",
  SCOPE_2: "var(--chart-2)",
  SCOPE_3: "var(--chart-3)",
};

export const SCOPES: Scope[] = ["SCOPE_1", "SCOPE_2", "SCOPE_3"];

// Category bars are coloured by the scope they belong to, so a glance ties a category back to
// its alcance. Within a scope the shade does not vary; the label carries the detail.
export function categoryColor(scope: Scope): string {
  return SCOPE_COLOR[scope];
}
