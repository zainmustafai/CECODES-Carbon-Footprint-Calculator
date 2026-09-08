import { describe, expect, it } from "vitest";
import { emptyElementGases } from "@/lib/calc/rollup";
import { buildPdf } from "../build-pdf";
import { PAGE_HEIGHT, readPdfTextByPage } from "./read-pdf-text";
import type { ReportVM, ResultRow } from "../types";

// Two kinds of test here. The smoke tests only prove a real PDF comes out. The layout tests
// read the finished PDF's drawing operators back (see read-pdf-text.ts) and assert where text
// actually landed, because the failure that prompted them (body text printed on top of the
// running header from page 2 onward) renders perfectly happily and is only visible to a reader.

// The page geometry build-pdf.tsx reserves, restated here on purpose: if someone retunes the
// header without retuning the page padding, these numbers stop agreeing and the tests say so.
const HEADER_BAND_TOP = 34;
const HEADER_BAND_BOTTOM = 84;
const CONTENT_TOP = 108;
const CONTENT_BOTTOM = PAGE_HEIGHT - 64;

/** Every column heading in the document; a continuation page must start with one of these. */
const COLUMN_HEADINGS = new Set([
  "Sede",
  "Categoría",
  "Elemento",
  "Alcance",
  "Cantidad",
  "Factor",
  "t CO2e",
  "%",
  "Incertidumbre",
  "Práctica reportable",
  "Dato / Unidad",
  "Gas",
  // The ISO 14064-1 declaration's twelve (or thirteen) columns. They are listed individually
  // rather than matched loosely because react-pdf emits each WRAPPED line of a heading as its own
  // text draw, so a heading that grows too wide for its column would silently start asserting
  // against a fragment nobody wrote.
  "Emisiones consolidadas",
  "kg CO2",
  "kg CH4 fósil",
  "kg CH4 no fósil",
  "kg N2O",
  "kg HFCs",
  "kg PFCs",
  "kg SF6",
  "kg NF3",
  "kg s/ident.",
  "kg CO2e",
]);

const base: ReportVM = {
  companyName: "Alimentos del Valle",
  companyProfile: {
    sector: null,
    contactEmail: null,
    nit: null,
    employeeCount: null,
    contactName: null,
    contactRole: null,
    contactPhone: null,
    website: null,
  },
  facilityName: "Planta Yumbo",
  year: 2024,
  gwpSet: "AR6",
  gridFactor: "0.217",
  bySede: [],
  activity: [],
  results: [
    {
      scope: "SCOPE_1",
      category: "Fuentes Fijas",
      subcategory: "Combustibles Líquidos (fijos)",
      element: "Diesel",
      unit: "Gal",
      quantity: 1000,
      secondaryQuantity: null,
      secondaryUnit: null,
      factorValue: "10.149",
      factorUnit: "kg CO2/gal",
      tonnes: 10.149,
      gases: emptyElementGases(),
      uncertaintyPct: "5",
    },
    {
      scope: "SCOPE_2",
      category: "Consumo de energía eléctrica",
      subcategory: null,
      element: "Electricidad",
      unit: "kWh",
      quantity: 500,
      secondaryQuantity: null,
      secondaryUnit: null,
      factorValue: "0.217",
      factorUnit: "kg CO2/kWh",
      tonnes: 0.1085,
      gases: emptyElementGases(),
      uncertaintyPct: null,
    },
  ],
  byScope: [
    { scope: "SCOPE_1", tonnes: 10.149 },
    { scope: "SCOPE_2", tonnes: 0.1085 },
    { scope: "SCOPE_3", tonnes: 0 },
  ],
  byCategory: [
    { scope: "SCOPE_1", category: "Fuentes Fijas", tonnes: 10.149 },
    { scope: "SCOPE_2", category: "Consumo de energía eléctrica", tonnes: 0.1085 },
  ],
  totalTonnes: 10.2575,
  removals: { rows: [], tonnes: 0 },
  cleanTech: [],
  biogenicTonnes: 0,
  biogenicCo2Tonnes: 0,
  biogenicCo2Partial: false,
  missingGridFactor: false,
  missingTransportSubsidyPrice: false,
  unpricedCount: 0,
  monthly: [],
  appliedFilters: { scope: [], category: null },
  generatedAt: new Date("2026-08-04T12:00:00Z"),
};

describe("buildPdf", () => {
  it("renders a non-empty PDF buffer without throwing", async () => {
    const buffer = await buildPdf(base);
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(0);
    // A real PDF starts with this magic header.
    expect(buffer.subarray(0, 5).toString("utf-8")).toBe("%PDF-");
  });

  it("renders with zero results and zero totals (a fresh year with no data)", async () => {
    const empty: ReportVM = {
      ...base,
      results: [],
      byScope: [
        { scope: "SCOPE_1", tonnes: 0 },
        { scope: "SCOPE_2", tonnes: 0 },
        { scope: "SCOPE_3", tonnes: 0 },
      ],
      byCategory: [],
      totalTonnes: 0,
    };
    const buffer = await buildPdf(empty);
    expect(buffer.length).toBeGreaterThan(0);
  });
});

// A report big enough to spill over several pages, which is the only situation where the
// running header, the repeating column headings and the footer can collide with anything.
const manyRows: ResultRow[] = Array.from({ length: 90 }, (_, i) => ({
  scope: i % 3 === 0 ? "SCOPE_1" : i % 3 === 1 ? "SCOPE_2" : "SCOPE_3",
  category: `Categoría ${i % 7}`,
  subcategory: `Subcategoría ${i}`,
  element: `Elemento de prueba número ${i}`,
  unit: "Gal",
  quantity: 1000 + i,
  secondaryQuantity: null,
  secondaryUnit: null,
  factorValue: "10.149",
  factorUnit: "kg CO2/gal",
  tonnes: 100 - i * 0.5,
  gases: emptyElementGases(),
  uncertaintyPct: i % 2 === 0 ? "5" : null,
}));

const multiPage: ReportVM = {
  ...base,
  facilityName: null,
  bySede: Array.from({ length: 12 }, (_, i) => ({
    facilityId: `f${i}`,
    facilityName: `Planta ${i}`,
    tonnes: 50 - i,
    incomplete: i === 3,
  })),
  results: manyRows,
  byScope: [
    { scope: "SCOPE_1", tonnes: 1200 },
    { scope: "SCOPE_2", tonnes: 400 },
    { scope: "SCOPE_3", tonnes: 200 },
  ],
  byCategory: Array.from({ length: 14 }, (_, i) => ({
    scope: "SCOPE_1",
    category: `Categoría ${i}`,
    tonnes: 100 - i,
  })),
  totalTonnes: 1800,
};

describe("buildPdf page layout", () => {
  it("never prints content underneath the running header or the footer", async () => {
    const pages = readPdfTextByPage(await buildPdf(multiPage));
    expect(pages.length).toBeGreaterThan(1);

    pages.forEach((page, index) => {
      expect(page.length).toBeGreaterThan(0);
      for (const draw of page) {
        const inHeaderBand =
          draw.yFromTop >= HEADER_BAND_TOP && draw.yFromTop < HEADER_BAND_BOTTOM;
        const isRunningHeader =
          draw.text === "HUELLA DE CARBONO CORPORATIVA" ||
          draw.text === `${multiPage.companyName} - Todas las sedes - ${multiPage.year}`;
        const isFooter = draw.text.startsWith("Huella de Carbono CECODES - ");

        if (isRunningHeader) {
          expect(inHeaderBand, `running header off the band on page ${index + 1}`).toBe(true);
          continue;
        }
        if (isFooter) continue;

        // Everything else is body copy, and must sit inside the reserved content box.
        expect(
          draw.yFromTop,
          `"${draw.text}" collides with the header on page ${index + 1}`,
        ).toBeGreaterThanOrEqual(CONTENT_TOP);
        expect(
          draw.yFromTop,
          `"${draw.text}" collides with the footer on page ${index + 1}`,
        ).toBeLessThan(CONTENT_BOTTOM);
      }
    });
  });

  it("repeats a table's column headings on every page it continues onto", async () => {
    const pages = readPdfTextByPage(await buildPdf(multiPage));

    // A page can also legitimately open with a brand-new section's title (minPresenceAhead
    // pushed the whole title+header+first-row block onto a fresh page rather than orphaning the
    // header row alone at the bottom of the previous one) - that is not a broken table
    // continuation, so it is allowed here too, alongside an actual repeated column heading.
    const SECTION_TITLES = new Set([
      "Panorama por categoría",
      "Panorama por GEI",
      "Priorización de fuentes de emisión (Pareto)",
      "Tendencia mensual (Alcance 2 - electricidad)",
      "Emisiones por sede",
      "Emisiones por categoría",
      "Declaración consolidada GEI (ISO 14064-1)",
      "Remociones o absorciones de carbono",
      "Datos sobre tecnologías más limpias y buenas prácticas",
      // Always rendered since 2026-09-03: it carries the factor-correction notice, so unlike the
      // other conditional sections it can now legitimately open a page in any report.
      "Notas y advertencias",
      "Incertidumbre por elemento",
    ]);

    // Page 1 opens with the title block, so only the continuation pages are constrained.
    pages.slice(1).forEach((page, offset) => {
      const body = page.filter((d) => d.yFromTop >= CONTENT_TOP);
      const top = Math.min(...body.map((d) => d.yFromTop));
      const firstLine = body.filter((d) => d.yFromTop === top).map((d) => d.text.trim());
      for (const text of firstLine) {
        expect(
          COLUMN_HEADINGS.has(text) || SECTION_TITLES.has(text),
          `page ${offset + 2} starts with "${text}" instead of a column heading or section title`,
        ).toBe(true);
      }
    });
  });

  it("leaves the title block to page 1 rather than repeating it there", async () => {
    const pages = readPdfTextByPage(await buildPdf(multiPage));
    const firstPageHeaderBand = pages[0].filter((d) => d.yFromTop < CONTENT_TOP);
    expect(firstPageHeaderBand).toEqual([]);
    expect(pages[0].some((d) => d.text === "Huella de Carbono Corporativa")).toBe(true);
  });
});

// Client decision 2026-09-07 (items 7 and 10). The "Panorama por GEI" list drops Scope 3 C1 and
// C2 and states their tonnes underneath instead, because those categories are spend-based and
// arrive as one undisaggregated CO2e lump. The trap is that the SAME report also carries the ISO
// 14064-1 declaration, which is the reconciling artifact and must keep every category: an
// exclusion that leaked into it would make the report stop adding up, silently.
describe("buildPdf: the per-gas panorama", () => {
  const withPurchased: ReportVM = {
    ...base,
    byCategory: [
      { scope: "SCOPE_1", category: "Fuentes Fijas", tonnes: 10.149 },
      { scope: "SCOPE_3", category: "C1: Bienes y servicios adquiridos", tonnes: 8064.745 },
      { scope: "SCOPE_3", category: "C2: Bienes de capital", tonnes: 100.5 },
      { scope: "SCOPE_3", category: "C6: Viajes de negocios", tonnes: 16.339 },
    ],
  };

  const textOf = async (vm: ReportVM) =>
    readPdfTextByPage(await buildPdf(vm))
      .flat()
      .map((d) => d.text);

  it("keeps the excluded categories out of the panorama but names their total under it", async () => {
    const text = await textOf(withPurchased);
    expect(text.some((t) => t.includes("Panorama por GEI"))).toBe(true);
    // The label and the ACV paragraph the client wrote, so the number is explained where it is
    // published rather than in a reply nobody keeps.
    expect(text.some((t) => t.includes("sin desagregar por gas"))).toBe(true);
    expect(text.some((t) => t.includes("ciclo de vida"))).toBe(true);
  });

  it("still shows SF6 and NF3 at zero rather than dropping the columns", async () => {
    // An inventory that silently omits SF6 reads as "we did not measure it", which is a
    // different claim from zero. Same rule the dashboard's fixed columns follow.
    const text = await textOf(withPurchased);
    expect(text).toContain("SF6");
    expect(text).toContain("NF3");
  });

  it("does not draw the undisaggregated bucket as if it were a gas", async () => {
    // It used to be the last row of the list. On a real inventory it dwarfed every actual gas,
    // which is what the client reported on 2026-09-08. It is a figure under the list now.
    const text = await textOf(withPurchased);
    expect(text.some((t) => t.includes("sin identificar"))).toBe(false);
    expect(text.some((t) => t.trim() === "CO2e sin desagregar")).toBe(false);
    expect(text.some((t) => t.includes("sin desagregar por gas"))).toBe(true);
  });

  it("leaves the ISO 14064-1 declaration whole, excluded categories included", async () => {
    // The declaration is built from vm.results, not from byCategory, and it is the artifact that
    // has to reconcile with the report total. Nothing above may narrow it.
    const text = await textOf(withPurchased);
    expect(text.some((t) => t.includes("Declaración consolidada GEI"))).toBe(true);
    expect(text.some((t) => t.includes("Total general"))).toBe(true);
  });
});

// Landscape (client feedback 2026-09-07, item 6). The Page's orientation prop and CONTENT_WIDTH
// are one decision spread over two constants, and the failure when they drift is silent: the page
// turns landscape while both SVG charts keep drawing at the old portrait width and hug the left
// margin, with no error anywhere. This is the assertion that would catch that.
describe("buildPdf page geometry", () => {
  it("uses the full landscape width, not the old portrait content box", async () => {
    const pages = readPdfTextByPage(await buildPdf(multiPage));
    const widest = Math.max(...pages.flat().map((d) => d.x));

    // Portrait A3 content ran to 54 + 733.89 = 787.89pt. Landscape runs to 54 + 1082.55 =
    // 1136.55pt. Anything that lands beyond the portrait box proves the wider box is in use.
    expect(widest).toBeGreaterThan(800);
    // And nothing may run off the physical page.
    expect(widest).toBeLessThan(1190.55);
  });
});
