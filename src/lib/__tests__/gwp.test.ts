import { describe, expect, it } from "vitest";
import { GWP, kgToTonnes, resolveGwpSet } from "@/lib/gwp";

describe("resolveGwpSet", () => {
  // AR6 for every year: CECODES's DASHBOARD workbook (2026-07-24) multiplies by the AR6
  // column unconditionally, whatever period is entered, and that spreadsheet is the
  // acceptance test (Req. §14.1). The resolved set is still pinned onto every ReportingYear
  // at creation, so years created under the old pre-2022 AR5 boundary are not restated.
  it("uses AR6 for every year, matching the client's workbook formulas", () => {
    expect(resolveGwpSet(2019)).toBe("AR6");
    expect(resolveGwpSet(2021)).toBe("AR6");
    expect(resolveGwpSet(2022)).toBe("AR6");
    expect(resolveGwpSet(2026)).toBe("AR6");
  });
});

describe("kgToTonnes", () => {
  // Every user-facing total is in tonnes. Kilograms are intermediate only.
  it("converts kilograms to tonnes", () => {
    expect(kgToTonnes(1000)).toBe(1);
    expect(kgToTonnes(0)).toBe(0);
    expect(kgToTonnes(19_600)).toBe(19.6); // 10 kg of R-22 at 1,960 kg CO2e/kg
    expect(kgToTonnes(108_500)).toBe(108.5); // 500,000 kWh at 0.217 kg CO2/kWh
  });
});

describe("GWP sets", () => {
  // Both columns transcribe the client workbook's "Global Waming Potentials" sheet exactly.
  it("distinguishes fossil and biogenic methane in both sets, as the client's table does", () => {
    expect(GWP.AR5.ch4Fossil).toBe(30);
    expect(GWP.AR5.ch4NonFossil).toBe(28);
    expect(GWP.AR6.ch4Fossil).toBe(29.8);
    expect(GWP.AR6.ch4NonFossil).toBe(27);
  });
});
