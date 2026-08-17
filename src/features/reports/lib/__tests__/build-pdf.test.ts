import { describe, expect, it } from "vitest";
import { buildPdf } from "../build-pdf";
import { A4_HEIGHT, readPdfTextByPage } from "./read-pdf-text";
import type { ReportVM, ResultRow } from "../types";

// Two kinds of test here. The smoke tests only prove a real PDF comes out. The layout tests
// read the finished PDF's drawing operators back (see read-pdf-text.ts) and assert where text
// actually landed, because the failure that prompted them (body text printed on top of the
// running header from page 2 onward) renders perfectly happily and is only visible to a reader.

// The page geometry build-pdf.tsx reserves, restated here on purpose: if someone retunes the
// header without retuning the page padding, these numbers stop agreeing and the tests say so.
const HEADER_BAND_TOP = 26;
const HEADER_BAND_BOTTOM = 64;
const CONTENT_TOP = 82;
const CONTENT_BOTTOM = A4_HEIGHT - 48;

/** Every column heading in the document; a continuation page must start with one of these. */
const COLUMN_HEADINGS = new Set([
  "Sede",
  "Categoría",
  "Elemento",
  "Alcance",
  "Cantidad",
  "Factor",
  "t CO2e",
  "% del total",
  "Incertidumbre",
  "Práctica reportable",
  "Dato / Unidad",
  "Gas",
]);

const base: ReportVM = {
  companyName: "Alimentos del Valle",
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
      factorValue: "10.149",
      factorUnit: "kg CO2/gal",
      tonnes: 10.149,
      uncertaintyPct: "5",
    },
    {
      scope: "SCOPE_2",
      category: "Consumo de energía eléctrica",
      subcategory: null,
      element: "Electricidad",
      unit: "kWh",
      quantity: 500,
      factorValue: "0.217",
      factorUnit: "kg CO2/kWh",
      tonnes: 0.1085,
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
  factorValue: "10.149",
  factorUnit: "kg CO2/gal",
  tonnes: 100 - i * 0.5,
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

    // Page 1 opens with the title block, so only the continuation pages are constrained.
    pages.slice(1).forEach((page, offset) => {
      const body = page.filter((d) => d.yFromTop >= CONTENT_TOP);
      const top = Math.min(...body.map((d) => d.yFromTop));
      const firstLine = body.filter((d) => d.yFromTop === top).map((d) => d.text.trim());
      for (const text of firstLine) {
        expect(
          COLUMN_HEADINGS.has(text),
          `page ${offset + 2} starts with "${text}" instead of a column heading`,
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
