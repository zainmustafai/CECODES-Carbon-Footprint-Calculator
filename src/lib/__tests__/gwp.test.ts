import { describe, expect, it } from "vitest";
import { GWP, kgToTonnes, resolveGwpSet } from "@/lib/gwp";

describe("resolveGwpSet", () => {
  // The boundary is load bearing: it is pinned onto every ReportingYear at creation so a
  // later change to this rule cannot silently restate a past year's emissions.
  it("uses AR5 through 2021 and AR6 after", () => {
    expect(resolveGwpSet(2019)).toBe("AR5");
    expect(resolveGwpSet(2021)).toBe("AR5");
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
  it("distinguishes fossil and biogenic methane only under AR6", () => {
    expect(GWP.AR5.ch4Fossil).toBe(GWP.AR5.ch4NonFossil);
    expect(GWP.AR6.ch4Fossil).not.toBe(GWP.AR6.ch4NonFossil);
  });
});
