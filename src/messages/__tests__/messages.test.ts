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

  it("never contain an em dash", () => {
    // A project convention, and one a reviewer cannot see at a glance in a 600 line JSON.
    const offenders = [
      ...flattenWithValues(es, "es"),
      ...flattenWithValues(en, "en"),
    ].filter(([, text]) => text.includes("—"));

    expect(offenders).toEqual([]);
  });
});

function flattenWithValues(
  value: unknown,
  prefix: string,
): Array<[string, string]> {
  if (typeof value === "string") return [[prefix, value]];
  if (value === null || typeof value !== "object") return [];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    flattenWithValues(child, `${prefix}.${key}`),
  );
}
