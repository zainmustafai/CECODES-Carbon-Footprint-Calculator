import type { Scope } from "@/lib/generated/prisma/client";
import type { CategoryVM, GroupedFactors, ScopeVM, SourceVM } from "./types";

// Entries arrive with Decimal already serialized to a string by the screen. Nothing in this
// module ever sees a Decimal or a number.
export type EntryRow = {
  id: string;
  emissionFactorId: string | null;
  scope: Scope;
  category: string;
  subcategory: string | null;
  element: string;
  unit: string;
  month: number | null;
  value: string;
  factorActive: boolean;
  biogenic: boolean;
};

export type ApplicabilityRow = { scope: Scope; category: string; applies: boolean };

const SCOPES: Scope[] = ["SCOPE_1", "SCOPE_2", "SCOPE_3"];

function appliesKey(scope: Scope, category: string) {
  return `${scope}::${category}`;
}

// Categories are the union of the factor library and whatever the year already holds, so a
// source whose factor was later deactivated or recategorized never silently disappears.
export function shapeEntries(
  entries: EntryRow[],
  applicability: ApplicabilityRow[],
  grouped: GroupedFactors,
): ScopeVM[] {
  // Absence of an applicability row means the category applies. That is the column default:
  // the toggle exists to let a company hide sources it does not have, not to opt in.
  const appliesMap = new Map(
    applicability.map((a) => [appliesKey(a.scope, a.category), a.applies]),
  );

  return SCOPES.map((scope) => {
    const scopeEntries = entries.filter((e) => e.scope === scope);

    const categoryNames: string[] = grouped[scope].map((c) => c.category);
    for (const entry of scopeEntries) {
      if (!categoryNames.includes(entry.category)) categoryNames.push(entry.category);
    }

    const categories: CategoryVM[] = categoryNames.map((category) => ({
      scope,
      category,
      applies: appliesMap.get(appliesKey(scope, category)) ?? true,
      sources: buildSources(scopeEntries.filter((e) => e.category === category)),
    }));

    return { scope, categories };
  });
}

function buildSources(entries: EntryRow[]): SourceVM[] {
  const byFactor = new Map<string, SourceVM>();

  for (const entry of entries) {
    // A row whose factor was hard-deleted (onDelete: SetNull) keeps its snapshotted labels.
    const key = entry.emissionFactorId ?? `orphan:${entry.element}:${entry.unit}`;
    let source = byFactor.get(key);
    if (!source) {
      source = {
        emissionFactorId: entry.emissionFactorId ?? "",
        scope: entry.scope,
        category: entry.category,
        subcategory: entry.subcategory,
        element: entry.element,
        unit: entry.unit,
        biogenic: entry.biogenic,
        factorActive: entry.factorActive,
        cells: [],
      };
      byFactor.set(key, source);
    }
    source.cells.push({ entryId: entry.id, month: entry.month, value: entry.value });
  }

  const sources = [...byFactor.values()];
  for (const source of sources) {
    source.cells.sort((a, b) => (a.month ?? 0) - (b.month ?? 0));
  }

  return sources.sort(
    (a, b) =>
      (a.subcategory ?? "").localeCompare(b.subcategory ?? "", "es") ||
      a.element.localeCompare(b.element, "es"),
  );
}

// How many of a source's cells actually hold a reported value.
export function reportedCount(source: SourceVM): number {
  return source.cells.filter((c) => c.value !== "").length;
}
