import type { Scope } from "@/lib/generated/prisma/client";
import type { FactorCategory, GroupedFactors } from "./types";

export type FactorRow = {
  id: string;
  scope: Scope;
  category: string;
  subcategory: string | null;
  element: string;
  unit: string;
  biogenic: boolean;
};

// Builds the Scope -> Categoria -> Subcategoria -> Elemento tree the picker navigates.
// Insertion order is preserved, so the caller controls ordering through the query.
export function groupFactors(rows: FactorRow[]): GroupedFactors {
  const grouped: GroupedFactors = { SCOPE_1: [], SCOPE_2: [], SCOPE_3: [] };

  for (const row of rows) {
    const categories = grouped[row.scope];
    let category = categories.find((c) => c.category === row.category);
    if (!category) {
      category = { category: row.category, subgroups: [] };
      categories.push(category);
    }

    let subgroup = category.subgroups.find((s) => s.subcategory === row.subcategory);
    if (!subgroup) {
      subgroup = { subcategory: row.subcategory, options: [] };
      category.subgroups.push(subgroup);
    }

    subgroup.options.push({
      id: row.id,
      element: row.element,
      unit: row.unit,
      subcategory: row.subcategory,
      biogenic: row.biogenic,
    });
  }

  return grouped;
}

export function findCategory(
  grouped: GroupedFactors,
  scope: Scope,
  category: string,
): FactorCategory | undefined {
  return grouped[scope].find((c) => c.category === category);
}
