// Fold accents away before matching. The factor library carries the Excel's accented Spanish
// names ("Diésel", "Carbón Genérico", "Líquidos") and Colombian users routinely type without
// accents, especially in a search box. cmdk's default scorer does not fold diacritics, so
// "carbon" would find nothing without this.
export function fold(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

export function accentInsensitiveFilter(value: string, search: string): number {
  return fold(value).includes(fold(search.trim())) ? 1 : 0;
}
