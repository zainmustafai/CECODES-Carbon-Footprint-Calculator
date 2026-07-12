import { describe, expect, it } from "vitest";
import en from "../en.json";
import es from "../es.json";

// es-CO is the product language and en is the toggle. A key that exists in one file and not
// the other renders as a raw key path in the UI, which is invisible in Spanish-only QA.
function flatten(value: unknown, prefix = ""): string[] {
  if (value === null || typeof value !== "object") return [prefix];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    flatten(child, prefix ? `${prefix}.${key}` : key),
  );
}

const esKeys = flatten(es).sort();
const enKeys = flatten(en).sort();

describe("message catalogs", () => {
  it("have identical key sets", () => {
    expect(enKeys.filter((k) => !esKeys.includes(k))).toEqual([]);
    expect(esKeys.filter((k) => !enKeys.includes(k))).toEqual([]);
  });
});

// The em-dash ban used to live here and covered only these two JSON files, which is how four
// em dashes reached src/features/preview/ with the suite green. It now lives in
// src/__tests__/conventions.test.ts, which walks the whole tree (this file included).
