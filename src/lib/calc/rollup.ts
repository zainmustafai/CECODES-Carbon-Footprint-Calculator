import type { EntryMode, GwpSet, Scope } from "@/lib/generated/prisma/client";
import {
  computeCo2eBreakdownKg,
  type FactorInput,
  type GasBreakdownKg,
} from "@/lib/calc/engine";
import { isFuelCategory } from "@/lib/calc/ch4-rule";
import { gallonsFromMoney, type FuelPrices, type FuelType } from "@/lib/calc/fuel";
import { kgToTonnes } from "@/lib/gwp";
import { isValidEntryValue, normalizeDecimalInput } from "@/lib/decimal-input";

// Rolls a reporting year's activity entries up into the totals the dashboard shows: overall,
// per scope, per category, and the Scope 2 monthly trend.
//
// This computes in float64, deliberately. The stored activity data and factors are Prisma
// Decimals and stay Decimals in the database; nothing here is persisted (the dashboard reads
// live and displays). The Excel this tool reproduces is itself a float64 spreadsheet, so
// computing the roll-ups as numbers is what parity actually requires. The engine and GWP math
// live in engine.ts and gwp.ts, both unit tested; this module only sums their output.

export type RollupFactor = {
  co2Factor: string | null;
  ch4Factor: string | null;
  n2oFactor: string | null;
  co2eFactor: string | null;
  biogenic: boolean;
  /** How `value` (and, for COUNT_TIMES_DISTANCE, `secondaryValue`) become the activity quantity
   *  the engine prices. Defaults to QUANTITY for every factor before 2026-08-15. */
  entryMode: EntryMode;
  /**
   * Which gas a PRE-BLENDED factor (co2eFactor set) actually is - "HFC", "PFC", "SF6", "NF3",
   * as captured by the importer from which sheet column carried the value (client feedback
   * 2026-08-15: "specify those 'other' such SF6, NF3, etc."). Optional and defaulted to null by
   * every caller that predates this feature (see rollup-entries.ts), exactly like `entryMode`
   * defaults to QUANTITY above. Meaningless for a per-gas factor (co2Factor/ch4Factor/n2oFactor).
   */
  gasType?: string | null;
  /**
   * Only meaningful when entryMode is MONEY_PER_GALLON: which of the year's average prices the
   * reported money is divided by. Optional and defaulted to null by every caller that predates
   * 2026-09-03, exactly like `gasType` above. A money-per-gallon factor with no fuel is reported
   * as missing a price rather than priced against a guess.
   */
  fuelType?: FuelType | null;
};

export type RollupEntry = {
  scope: Scope;
  category: string;
  /** Null is normal: plenty of the library's categories have no subcategory level. */
  subcategory: string | null;
  element: string;
  month: number | null;
  /** Activity data as a Decimal string, or null when not reported. For MONEY_PER_GALLON entries
   *  this is money (COP), not gallons. For COUNT_TIMES_DISTANCE entries this is the passenger/
   *  vehicle count. */
  value: string | null;
  /** Only meaningful for COUNT_TIMES_DISTANCE entries: distance in km. Null otherwise. */
  secondaryValue: string | null;
  /**
   * One row per route for a COUNT_TIMES_DISTANCE source (client feedback 2026-09-03, E3). When
   * present these ARE the activity: the engine sums each row's product. `value` is kept in step
   * with that sum by saveTransportTrips, so the legacy value x secondaryValue path below can
   * never disagree with this one; the fallback exists for a source entered before trip rows and
   * for callers that do not load them.
   */
  trips?: { count: string; distanceKm: string }[];
  /** null when the factor row was removed (onDelete SetNull); Scope 2 never has one. */
  factor: RollupFactor | null;
};

export type ScopeTotals = Record<Scope, number>;

/**
 * The factor-library category whose entries are carbon REMOVALS (land-use changes with negative
 * factors). The client's workbook keeps them in their own table (BASE_remociones) with their own
 * total and never adds them to the emissions total; the rollup reproduces that separation. The
 * name is the library's exact Excel spelling, which the tool never hardcodes elsewhere.
 */
export const REMOVALS_CATEGORY = "Remociones";

/**
 * The bucket a pre-blended (otherGasesTonnes) entry falls into on CategoryTotal.otherGasesByType
 * when its factor carries no gasType - an import from before the 2026-08-15 gasType backfill, or
 * a genuinely gas-less pre-blended factor such as a spend/distance-based Scope 3 line (see
 * map-row.ts: column 9 read as CO2e carries no gas-identifying column). A stable internal label,
 * not translated UI copy: dashboard-data.ts maps anything that is not one of the four named gas
 * families onto the UNIDENTIFIED GasKey, and gas-bars.tsx renders that key through
 * dashboard.gasNames so the raw string never reaches a screen.
 *
 * The user-facing name for this bucket is "CO2e sin desagregar", not "sin identificar": the
 * client read the old wording as "we do not know what this is" and asked why the value was not
 * simply added to CO2. It cannot be - these are CO2e, and the gas mass was never retained - so
 * the label says what the number is instead of what we lack.
 */
export const OTHER_GAS_FALLBACK = "Otros gases sin identificar";

export type CategoryTotal = {
  scope: Scope;
  category: string;
  tonnes: number;
  /**
   * The gas breakdown of `tonnes`, for the dashboard's "emissions by gas" view. `tonnes` is
   * DEFINED as co2Tonnes + ch4Tonnes + n2oTonnes + otherGasesTonnes (see the accumulation loop
   * below), so the four fields reconcile to it by construction, for every entry and therefore
   * every aggregate built by summing entries.
   */
  co2Tonnes: number;
  ch4Tonnes: number;
  /**
   * ch4Tonnes, split by which GWP priced it: fossil (29.8 under AR6) or non-fossil (27). Client
   * feedback 2026-09-03 asks the dashboard to show the two separately, because "if biogenic, then
   * CH4 is non-fossil and non-biogenic is fossil". Always sums to ch4Tonnes exactly.
   */
  ch4FossilTonnes: number;
  ch4NonFossilTonnes: number;
  n2oTonnes: number;
  /** Entries whose factor arrived already expressed as CO2e (refrigerants, SF6/PFC/NF3, or
   *  spend/distance-based Scope 3): the individual gas mass was never retained for these.
   *  Equal to the sum of otherGasesByType's values, by construction (see the accumulation loop) -
   *  kept as its own field because most callers (the KPI reconciliation, dashboard-data.ts's
   *  gasTotals) only ever need the total, not the per-gas-type split. */
  otherGasesTonnes: number;
  /**
   * otherGasesTonnes, split by which gas the pre-blended factor was captured as - client
   * feedback 2026-08-15 ("please include all of the gases separately... specify those 'other'
   * such SF6, NF3, etc."). Keyed by RollupFactor.gasType ("HFC", "PFC", "SF6", "NF3", ...), or
   * OTHER_GAS_FALLBACK when no gasType was captured. Always sums to otherGasesTonnes exactly.
   */
  otherGasesByType: Record<string, number>;
  /** Priced entries with a real per-gas split. */
  gasResolvedEntries: number;
  /** Priced entries counted only in otherGasesTonnes, with no gas-level detail available. */
  otherGasesEntries: number;
};

export type SubcategoryTotal = {
  scope: Scope;
  category: string;
  subcategory: string | null;
  tonnes: number;
};

/**
 * One element's emissions expressed the way the client's "Declaración consolidada GEI
 * (ISO 14064-1)" reports them: CO2, CH4 and N2O as gas MASS in kg, and the pre-blended gases
 * (HFCs, PFCs, SF6, NF3) as CO2e kg, because their mass was never retained by the factor library.
 *
 * The reconciliation this type exists to guarantee, and which rollup.test.ts pins for every
 * element: co2MassKg + ch4FossilMassKg x 29.8 + ch4NonFossilMassKg x 27 + n2oMassKg x 273 plus
 * every preBlendedCo2eKgByType value equals the element's own tonnes x 1000, under AR6.
 */
export type ElementGasTotals = {
  co2MassKg: number;
  /** CH4 mass priced at the fossil GWP (a non-biogenic source). */
  ch4FossilMassKg: number;
  /** CH4 mass priced at the non-fossil GWP (a biogenic source). */
  ch4NonFossilMassKg: number;
  n2oMassKg: number;
  /** CO2e kg keyed by RollupFactor.gasType ("HFC", "PFC", "SF6", "NF3"), or OTHER_GAS_FALLBACK
   *  when the pre-blended factor carried no gas-identifying column. Empty for an element with a
   *  real per-gas split. */
  preBlendedCo2eKgByType: Record<string, number>;
};

export type ElementTotal = {
  scope: Scope;
  category: string;
  subcategory: string | null;
  element: string;
  tonnes: number;
  /** The per-gas view of `tonnes`, for the ISO 14064-1 declaration. */
  gases: ElementGasTotals;
};

/** A zeroed per-gas breakdown. Exported because report fixtures and any caller building a
 *  ResultRow by hand needs the same empty shape rather than repeating five zero fields. */
export function emptyElementGases(): ElementGasTotals {
  return {
    co2MassKg: 0,
    ch4FossilMassKg: 0,
    ch4NonFossilMassKg: 0,
    n2oMassKg: 0,
    preBlendedCo2eKgByType: {},
  };
}

/**
 * Folds one source's gas breakdown into an element's running totals. The pre-blended CO2e is
 * keyed by gas so the declaration can put it in the right column; a source with a real per-gas
 * split contributes mass and never touches that map.
 */
function addGases(target: ElementGasTotals, gas: GasBreakdownKg, gasTypeKey: string): void {
  if (gas.isPreBlended) {
    target.preBlendedCo2eKgByType[gasTypeKey] =
      (target.preBlendedCo2eKgByType[gasTypeKey] ?? 0) + gas.otherKg;
    return;
  }
  target.co2MassKg += gas.co2MassKg;
  target.ch4FossilMassKg += gas.ch4FossilMassKg;
  target.ch4NonFossilMassKg += gas.ch4NonFossilMassKg;
  target.n2oMassKg += gas.n2oMassKg;
}

/** One month of the Scope 2 trend. tonnes is null when no month was reported (a gap, not 0). */
export type MonthlyPoint = { month: number; tonnes: number | null };

export type YearRollup = {
  totalTonnes: number;
  byScope: ScopeTotals;
  /** Per (scope, category), largest first. */
  byCategory: CategoryTotal[];
  /**
   * The rest of the hierarchy Requirements 7.4 asks for:
   * element -> subcategory -> category -> scope -> company. Largest first.
   *
   * These exist so that the report/export and any dashboard drill-down read from the SAME engine
   * as the headline totals. The alternative (each surface grouping the raw entries itself) is how
   * you end up with two engines that disagree, which already happened once here.
   */
  bySubcategory: SubcategoryTotal[];
  byElement: ElementTotal[];
  /** Twelve entries, Enero to Diciembre. Only Scope 2 is captured monthly. */
  scope2Monthly: MonthlyPoint[];
  /**
   * Total CO2e of the sources FLAGGED BIOGENIC. This includes their CH4 and N2O, so it is NOT
   * "biogenic CO2" and MUST NOT be subtracted from the headline: doing so would remove real,
   * non-biogenic emissions. For the GHG Protocol memo item, use biogenicCo2Tonnes.
   */
  biogenicTonnes: number;
  /**
   * The biogenic CO2 portion only: the memo item the GHG Protocol actually asks for, and the
   * number to subtract if CECODES rules that biogenic CO2 sits outside the headline
   * (Requirements 12.A5). CH4 and N2O from biomass stay in the scopes either way.
   */
  biogenicCo2Tonnes: number;
  /**
   * True when a biogenic source carried only a consolidated CO2e factor, which cannot be split
   * back into its gases. biogenicCo2Tonnes then UNDERSTATES the memo item, and says so rather
   * than guessing a decomposition.
   */
  biogenicCo2Partial: boolean;
  /**
   * Carbon removals (category "Remociones"), kept OUT of every number above, exactly as the
   * client's workbook keeps BASE_remociones out of BASE_emisiones. tonnes is negative (or 0 when
   * nothing is reported). unpricedCount counts removal rows whose factor could not be read; it is
   * separate from the emissions unpricedCount because it makes THIS total incomplete, not those.
   */
  removals: {
    tonnes: number;
    byElement: ElementTotal[];
    unpricedCount: number;
  };
  /** The year has no national grid factor, so its Scope 2 emissions could not be computed. */
  missingGridFactor: boolean;
  /** The year has no transport-subsidy price per gallon, so its MONEY_PER_GALLON entries
   *  (Scope 3 Cat 6 "Subsidios de transporte") could not be computed. */
  missingTransportSubsidyPrice: boolean;
  /**
   * Entries EXCLUDED from every total because they could not be priced: no factor row, a factor
   * with no readable value (e.g. spend-only COP/USD), or Scope 2 with no grid factor. A non-zero
   * count means the totals are INCOMPLETE, not that those sources emit nothing. Anything that
   * publishes a total (an export, a report, a snapshot) must disclose this.
   */
  unpricedCount: number;
};

const SCOPES: Scope[] = ["SCOPE_1", "SCOPE_2", "SCOPE_3"];

// Activity data is a raw Decimal string. Parse defensively: an unreported (null), blank, or
// somehow-invalid value contributes zero rather than NaN-poisoning a whole scope.
function parseActivity(value: string | null): number {
  if (value === null) return 0;
  const normalized = normalizeDecimalInput(value);
  if (normalized === "" || !isValidEntryValue(normalized)) return 0;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

// Whether the engine can actually turn this factor into a number. A factor row can exist and
// still be unpriceable: an admin may fill only co2eFactorCop / co2eFactorUsd (the spend-based
// columns), which FactorInput does not carry, and computeCo2eKg would then dutifully return 0.
// A real emission source silently worth 0 t, in a category that looks complete, is exactly the
// class of bug this tool exists to replace.
function isPriceable(factor: RollupFactor): boolean {
  return (
    factor.co2eFactor !== null ||
    factor.co2Factor !== null ||
    factor.ch4Factor !== null ||
    factor.n2oFactor !== null
  );
}

// `category` is needed only so the engine can answer "is this a fuel", which the "is-a-fuel" CH4
// rule depends on. Under the default rule it is unused but harmless. See lib/calc/ch4-rule.ts.
function toFactorInput(factor: RollupFactor, category: string): FactorInput {
  const num = (value: string | null) => (value === null ? null : Number(value));
  return {
    co2Factor: num(factor.co2Factor),
    ch4Factor: num(factor.ch4Factor),
    n2oFactor: num(factor.n2oFactor),
    co2eFactor: num(factor.co2eFactor),
    biogenic: factor.biogenic,
    isFuel: isFuelCategory(category),
  };
}

export function rollupYear({
  entries,
  gridFactor,
  fuelPrices,
  gwpSet,
}: {
  entries: RollupEntry[];
  /** kg CO2 per kWh for the reporting year, or null when it has not been loaded. */
  gridFactor: string | null;
  /** COP per gallon for the reporting year, one price per fuel, or null when they have not been
   *  loaded. Only consulted for MONEY_PER_GALLON entries (Scope 3 Cat 6 "Subsidios de
   *  transporte"), which divide by the price of the fuel their own factor names. */
  fuelPrices: FuelPrices | null;
  gwpSet: GwpSet;
}): YearRollup {
  let unpricedCount = 0;
  let biogenicCo2Tonnes = 0;
  let biogenicCo2Partial = false;

  const byScope: ScopeTotals = { SCOPE_1: 0, SCOPE_2: 0, SCOPE_3: 0 };
  const categories = new Map<string, CategoryTotal>();
  const subcategories = new Map<string, SubcategoryTotal>();
  const elements = new Map<string, ElementTotal>();
  const monthKg = new Array<number>(12).fill(0);
  const monthReported = new Array<boolean>(12).fill(false);
  let biogenicTonnes = 0;
  let missingGridFactor = false;
  let missingTransportSubsidyPrice = false;

  const grid = gridFactor !== null ? Number(gridFactor) : null;

  let removalsTonnes = 0;
  let removalsUnpriced = 0;
  const removalElements = new Map<string, ElementTotal>();

  for (const entry of entries) {
    const entryMode: EntryMode = entry.factor?.entryMode ?? "QUANTITY";

    let activity: number;
    if (entryMode === "MONEY_PER_GALLON") {
      // Reference data, not user input: like a missing grid factor, this excludes the entry and
      // flags the year as incomplete rather than dividing by a fabricated price. The price is
      // the one for THIS factor's own fuel, so a diesel subsidy is never charged the gasoline
      // price; an unusable price (absent, zero, unparseable) is reported the same way.
      const gallons = gallonsFromMoney(
        parseActivity(entry.value),
        fuelPrices,
        entry.factor?.fuelType ?? null,
      );
      if (gallons === null) {
        missingTransportSubsidyPrice = true;
        unpricedCount += 1;
        continue;
      }
      activity = gallons;
    } else if (entryMode === "COUNT_TIMES_DISTANCE") {
      // Sum each route's PRODUCT, never the product of the sums. Either half missing means "not
      // fully reported yet", the same honest 0 a single missing QUANTITY value already produces,
      // not a pricing failure, so it is not excluded or flagged.
      const trips = entry.trips ?? [];
      activity =
        trips.length > 0
          ? trips.reduce(
              (sum, trip) => sum + parseActivity(trip.count) * parseActivity(trip.distanceKm),
              0,
            )
          : parseActivity(entry.value) * parseActivity(entry.secondaryValue);
    } else {
      activity = parseActivity(entry.value);
    }
    const reported = entry.value !== null;

    // Removals divert BEFORE any emissions accumulator is touched. They are priced by the same
    // engine (their library rows carry a negative consolidated CO2e factor), but their tonnes
    // belong to their own total, never to a scope, a category, or the headline.
    if (entry.category.trim() === REMOVALS_CATEGORY) {
      if (!entry.factor || !isPriceable(entry.factor)) {
        removalsUnpriced += 1;
        continue;
      }
      // Priced through the breakdown rather than computeCo2eKg so a removal carries the same
      // per-gas detail every other element now does; the CO2e is the sum of that breakdown, so
      // the total is unchanged.
      const removalGas = computeCo2eBreakdownKg(
        activity,
        toFactorInput(entry.factor, entry.category),
        gwpSet,
      );
      const removalTonnes = kgToTonnes(
        removalGas.co2Kg + removalGas.ch4Kg + removalGas.n2oKg + removalGas.otherKg,
      );
      const removalGasTypeKey = entry.factor.gasType?.trim() || OTHER_GAS_FALLBACK;
      removalsTonnes += removalTonnes;
      const key = `${entry.subcategory ?? ""}::${entry.element}`;
      const existing = removalElements.get(key);
      if (existing) {
        existing.tonnes += removalTonnes;
        addGases(existing.gases, removalGas, removalGasTypeKey);
      } else {
        const gases = emptyElementGases();
        addGases(gases, removalGas, removalGasTypeKey);
        removalElements.set(key, {
          scope: entry.scope,
          category: entry.category,
          subcategory: entry.subcategory,
          element: entry.element,
          tonnes: removalTonnes,
          gases,
        });
      }
      continue;
    }

    let gas: GasBreakdownKg;
    if (entry.scope === "SCOPE_2") {
      // Scope 2 does not carry a factor on the row. It is the national grid factor for the
      // year, a pure CO2 value in kg CO2/kWh (GWP of CO2 is 1) - 100% CO2 for gas-bucket
      // purposes, never CH4/N2O/other.
      if (grid === null) {
        // A year with no grid factor cannot be priced. This used to fall through and add a
        // real 0 into byScope, byCategory and the monthly series, guarded only by the flag
        // below. Any consumer that forgot to read the flag (an export, a snapshot writer)
        // would then publish a fabricated zero as if it were a measurement. Excluding the
        // entry is the honest answer: the flag says the number is incomplete, and the number
        // itself does not lie.
        missingGridFactor = true;
        unpricedCount += 1;
        continue;
      }
      // GWP of CO2 is 1, so the CO2e kg and the CO2 mass kg are the same number here.
      gas = {
        co2Kg: activity * grid,
        ch4Kg: 0,
        n2oKg: 0,
        otherKg: 0,
        isPreBlended: false,
        co2MassKg: activity * grid,
        n2oMassKg: 0,
        ch4FossilMassKg: 0,
        ch4NonFossilMassKg: 0,
        ch4FossilKg: 0,
        ch4NonFossilKg: 0,
      };
    } else if (entry.factor && isPriceable(entry.factor)) {
      gas = computeCo2eBreakdownKg(activity, toFactorInput(entry.factor, entry.category), gwpSet);
    } else {
      // Either the factor row was removed (onDelete SetNull), or it exists but carries no
      // value the engine can read: the spend-based COP/USD columns are a real example, since
      // an admin can fill only those and FactorInput cannot see them. Both cases are unpriced.
      // Skip rather than count a zero into a category that would then look complete.
      unpricedCount += 1;
      continue;
    }

    const co2Tonnes = kgToTonnes(gas.co2Kg);
    const ch4Tonnes = kgToTonnes(gas.ch4Kg);
    const ch4FossilTonnes = kgToTonnes(gas.ch4FossilKg);
    const ch4NonFossilTonnes = kgToTonnes(gas.ch4NonFossilKg);
    const n2oTonnes = kgToTonnes(gas.n2oKg);
    const otherGasesTonnes = kgToTonnes(gas.otherKg);
    // `tonnes` is DEFINED as this sum, not computed separately from the same kg value - the
    // one thing that makes "the four gas buckets always reconcile to the total" true by
    // construction rather than by coincidence.
    const tonnes = co2Tonnes + ch4Tonnes + n2oTonnes + otherGasesTonnes;
    byScope[entry.scope] += tonnes;

    // Which named-gas bucket a pre-blended entry's otherGasesTonnes falls into. Only meaningful
    // when gas.isPreBlended (otherGasesTonnes came from this entry at all); computed
    // unconditionally here since it is cheap and keeps the branches below symmetric.
    const gasTypeKey = entry.factor?.gasType?.trim() || OTHER_GAS_FALLBACK;

    const key = `${entry.scope}::${entry.category}`;
    const existing = categories.get(key);
    if (existing) {
      existing.tonnes += tonnes;
      existing.co2Tonnes += co2Tonnes;
      existing.ch4Tonnes += ch4Tonnes;
      existing.ch4FossilTonnes += ch4FossilTonnes;
      existing.ch4NonFossilTonnes += ch4NonFossilTonnes;
      existing.n2oTonnes += n2oTonnes;
      existing.otherGasesTonnes += otherGasesTonnes;
      if (gas.isPreBlended) {
        existing.otherGasesEntries += 1;
        existing.otherGasesByType[gasTypeKey] =
          (existing.otherGasesByType[gasTypeKey] ?? 0) + otherGasesTonnes;
      } else {
        existing.gasResolvedEntries += 1;
      }
    } else {
      const otherGasesByType: Record<string, number> = {};
      if (gas.isPreBlended) otherGasesByType[gasTypeKey] = otherGasesTonnes;
      categories.set(key, {
        scope: entry.scope,
        category: entry.category,
        tonnes,
        co2Tonnes,
        ch4Tonnes,
        ch4FossilTonnes,
        ch4NonFossilTonnes,
        n2oTonnes,
        otherGasesTonnes,
        otherGasesByType,
        gasResolvedEntries: gas.isPreBlended ? 0 : 1,
        otherGasesEntries: gas.isPreBlended ? 1 : 0,
      });
    }

    // The finer levels are the same tonnes, keyed more precisely. Sub-totals therefore add up to
    // the category total by construction, which is what makes a drill-down trustworthy.
    const subKey = `${key}::${entry.subcategory ?? ""}`;
    const sub = subcategories.get(subKey);
    if (sub) sub.tonnes += tonnes;
    else
      subcategories.set(subKey, {
        scope: entry.scope,
        category: entry.category,
        subcategory: entry.subcategory,
        tonnes,
      });

    // Keyed on the element, so a source split across twelve months collapses into one row.
    const elementKey = `${subKey}::${entry.element}`;
    const element = elements.get(elementKey);
    if (element) {
      element.tonnes += tonnes;
      addGases(element.gases, gas, gasTypeKey);
    } else {
      const gases = emptyElementGases();
      addGases(gases, gas, gasTypeKey);
      elements.set(elementKey, {
        scope: entry.scope,
        category: entry.category,
        subcategory: entry.subcategory,
        element: entry.element,
        tonnes,
        gases,
      });
    }

    if (
      entry.scope === "SCOPE_2" &&
      entry.month != null &&
      entry.month >= 1 &&
      entry.month <= 12
    ) {
      // Scope 2 is always pure CO2 (see the gas assignment above), so gas.co2Kg is the whole kg.
      monthKg[entry.month - 1] += gas.co2Kg;
      if (reported) monthReported[entry.month - 1] = true;
    }

    if (entry.factor?.biogenic) {
      // Two different numbers, and conflating them was a real bug.
      //
      // biogenicTonnes is the source's WHOLE CO2e, CH4 and N2O included. It answers "how much of
      // the footprint comes from biomass".
      //
      // biogenicCo2Tonnes is the CO2 term alone. That is the GHG Protocol memo item, and the only
      // number it would ever be correct to subtract from the headline: methane and N2O from
      // burning biomass stay inside the scopes no matter how 12.A5 is answered. Subtracting the
      // whole CO2e (which is what this used to accumulate) would quietly delete real emissions.
      biogenicTonnes += tonnes;

      if (entry.factor.co2eFactor !== null) {
        // A consolidated CO2e factor cannot be split back into its gases. Say so rather than
        // guess a decomposition: the memo understates, and biogenicCo2Partial admits it.
        biogenicCo2Partial = true;
      } else if (entry.factor.co2Factor !== null) {
        // GWP of CO2 is 1, so the CO2 term is just activity x factor.
        biogenicCo2Tonnes += kgToTonnes(activity * Number(entry.factor.co2Factor));
      }
    }
  }

  const scope2Monthly: MonthlyPoint[] = monthKg.map((kg, index) => ({
    month: index + 1,
    // A month nobody reported is a gap in the trend, not a zero. 0 means "reported nothing".
    tonnes: monthReported[index] ? kgToTonnes(kg) : null,
  }));

  const byTonnesDesc = <T extends { tonnes: number }>(a: T, b: T) => b.tonnes - a.tonnes;
  const byCategory = [...categories.values()].sort(byTonnesDesc);
  const bySubcategory = [...subcategories.values()].sort(byTonnesDesc);
  const byElement = [...elements.values()].sort(byTonnesDesc);
  const totalTonnes = SCOPES.reduce((sum, scope) => sum + byScope[scope], 0);

  // Most negative first: the largest removal is the most interesting row.
  const removalsByElement = [...removalElements.values()].sort((a, b) => a.tonnes - b.tonnes);

  return {
    totalTonnes,
    byScope,
    byCategory,
    bySubcategory,
    byElement,
    scope2Monthly,
    biogenicTonnes,
    biogenicCo2Tonnes,
    biogenicCo2Partial,
    removals: {
      tonnes: removalsTonnes,
      byElement: removalsByElement,
      unpricedCount: removalsUnpriced,
    },
    missingGridFactor,
    missingTransportSubsidyPrice,
    unpricedCount,
  };
}
