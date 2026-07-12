import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { rollupYear, type RollupEntry, type RollupFactor } from "@/lib/calc/rollup";
import type { GwpSet, Scope } from "@/lib/generated/prisma/client";

// THE ACCEPTANCE TEST (Requirements section 14.1).
//
// The tool is "done" when it reproduces the client's Excel totals for an agreed sample company.
// This harness is the thing that will prove it. It reads self-contained fixtures: a company-year
// of activity data, plus the totals the EXCEL produced from it, and diffs them against rollupYear.
//
// It is deliberately fixture-driven rather than hardcoded, because the fixture we actually need
// does not exist yet: the only workbook CECODES has sent is the factor library, with no company
// data and no totals in it. When they send a filled-in calculation workbook (item 0 of
// docs/CLIENT_DECISION_MEMO.md), transcribing it into a JSON file in ./fixtures/parity/ is the
// only work required to run the real comparison.
//
// READ THIS BEFORE TRUSTING A GREEN RUN: the only fixture present today is hand-computed from the
// same formulas the engine implements. It proves the harness works and the engine is
// self-consistent. It does NOT prove parity. The `todo` at the bottom is the standing reminder.

const FIXTURE_DIR = join(__dirname, "fixtures", "parity");

type FixtureFactor = {
  co2Factor: string | null;
  ch4Factor: string | null;
  n2oFactor: string | null;
  co2eFactor: string | null;
  biogenic: boolean;
};

type FixtureEntry = {
  note?: string;
  scope: Scope;
  category: string;
  subcategory?: string | null;
  element: string;
  /** Scopes 1 and 3: one annual value, month null. */
  month?: number | null;
  value?: string;
  /** Scope 2 only: twelve monthly values, January first. */
  monthlyValues?: string[];
  factor: FixtureFactor | null;
};

type Fixture = {
  name: string;
  origin: "client" | "hand-computed";
  source: string;
  year: number;
  gwpSet: GwpSet;
  gridFactor: string | null;
  toleranceTonnes: number;
  entries: FixtureEntry[];
  expected: {
    totalTonnes: number;
    byScope: Record<Scope, number>;
    byCategory: { scope: Scope; category: string; tonnes: number }[];
  };
};

function loadFixtures(): Fixture[] {
  return readdirSync(FIXTURE_DIR)
    .filter((file) => file.endsWith(".json"))
    .map((file) => JSON.parse(readFileSync(join(FIXTURE_DIR, file), "utf8")) as Fixture);
}

// A fixture entry is either one annual row or twelve monthly rows. Flatten to what the engine
// consumes. Strings stay strings the whole way: these are Decimals, and JSON must not round them.
function toRollupEntries(fixture: Fixture): RollupEntry[] {
  return fixture.entries.flatMap((entry): RollupEntry[] => {
    const factor: RollupFactor | null = entry.factor
      ? {
          co2Factor: entry.factor.co2Factor,
          ch4Factor: entry.factor.ch4Factor,
          n2oFactor: entry.factor.n2oFactor,
          co2eFactor: entry.factor.co2eFactor,
          biogenic: entry.factor.biogenic,
        }
      : null;

    const common = {
      scope: entry.scope,
      category: entry.category,
      subcategory: entry.subcategory ?? null,
      element: entry.element,
      factor,
    };

    if (entry.monthlyValues) {
      return entry.monthlyValues.map((value, index) => ({
        ...common,
        month: index + 1,
        value,
      }));
    }

    return [{ ...common, month: entry.month ?? null, value: entry.value ?? null }];
  });
}

const fixtures = loadFixtures();

describe("Excel parity (Requirements 14.1)", () => {
  it("has at least one fixture, or the acceptance test is not being run at all", () => {
    expect(fixtures.length).toBeGreaterThan(0);
  });

  for (const fixture of fixtures) {
    describe(`${fixture.name} [${fixture.origin}]`, () => {
      const rollup = rollupYear({
        entries: toRollupEntries(fixture),
        gridFactor: fixture.gridFactor,
        gwpSet: fixture.gwpSet,
      });
      const tolerance = fixture.toleranceTonnes;

      it("reproduces the company total", () => {
        expect(rollup.totalTonnes).toBeCloseTo(
          fixture.expected.totalTonnes,
          decimalsFor(tolerance),
        );
      });

      it("reproduces every scope total", () => {
        // Reported as an object rather than three separate asserts, so a failure shows all
        // three scopes at once and you can see immediately which one drifted.
        const actual = round(rollup.byScope, tolerance);
        const expected = round(fixture.expected.byScope, tolerance);
        expect(actual).toEqual(expected);
      });

      it("reproduces every category total, and introduces no category the Excel does not have", () => {
        // The failure message is the whole point of this test. A bare number diff sends you
        // hunting; naming the (scope, category) pair puts you on the row.
        const actual = new Map(
          rollup.byCategory.map((c) => [`${c.scope} / ${c.category}`, c.tonnes]),
        );
        const expected = new Map(
          fixture.expected.byCategory.map((c) => [`${c.scope} / ${c.category}`, c.tonnes]),
        );

        const differences: string[] = [];
        for (const [key, want] of expected) {
          const got = actual.get(key);
          if (got === undefined) {
            differences.push(`${key}: expected ${want} t, we produced NOTHING`);
          } else if (Math.abs(got - want) > tolerance) {
            differences.push(`${key}: expected ${want} t, got ${got} t (off by ${got - want})`);
          }
        }
        for (const key of actual.keys()) {
          if (!expected.has(key)) {
            differences.push(`${key}: we produced ${actual.get(key)} t, the Excel has no such row`);
          }
        }

        expect(differences).toEqual([]);
      });
    });
  }

  // A standing, visible reminder in every test run. It disappears the day a fixture with
  // "origin": "client" lands here, and not before. Do not delete it to make the output tidy:
  // its whole job is to stop a green suite from being mistaken for a passed acceptance test.
  const hasClientFixture = fixtures.some((f) => f.origin === "client");
  if (!hasClientFixture) {
    it.todo(
      "reproduces CECODES's OWN workbook totals (BLOCKED: they have not sent a filled-in " +
        "calculation workbook. See docs/CLIENT_DECISION_MEMO.md item 0. Until this exists, " +
        "parity is unproven and the suite passing means nothing about acceptance.)",
    );
  }
});

// toBeCloseTo takes a number of decimal places; the fixtures speak in tonnes of tolerance.
function decimalsFor(tolerance: number): number {
  return Math.max(0, Math.round(-Math.log10(tolerance)));
}

function round<T extends string>(
  values: Record<T, number>,
  tolerance: number,
): Record<string, number> {
  const places = decimalsFor(tolerance);
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [
      key,
      Number((value as number).toFixed(places)),
    ]),
  );
}
