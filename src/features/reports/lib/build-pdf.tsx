import { readFileSync } from "node:fs";
import path from "node:path";
import { Document, Image, Page, Text, View, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import type { ReportVM, ResultRow } from "./types";
import { formatGwpSource } from "@/lib/gwp";
import { buildIsoGasTable } from "./iso-gas-table";

// The PDF report (Requirements 10, 14.7). A human-readable summary, in Spanish to match the tool
// and the Excel export. It carries the same numbers the dashboard shows, because it is built from
// the same ReportVM (loadReport -> rollupYear), and it never does its own arithmetic.
//
// The .xlsx export exists so CECODES can diff totals against their spreadsheet; this PDF exists so
// a company can read and share its footprint. The uncertainty table is the one thing the PDF adds
// over the dashboard, per CECODES's decision to disclose uncertainty in the report, not on screen.
// It is a per-element LIST only: no combined figure, because no method for combining uncertainties
// has been agreed, and inventing one in the first artifact that leaves the building would be the
// exact quiet-lie this codebase guards against.

const SCOPE_LABEL: Record<string, string> = {
  SCOPE_1: "Alcance 1",
  SCOPE_2: "Alcance 2",
  SCOPE_3: "Alcance 3",
};

// The report's fixed print palette, matching the app's brand tokens (globals.css) exactly. A
// plain hardcoded literal on purpose: react-pdf renders server-side through its own layout
// engine, not a browser DOM, so a CSS custom property has no meaning here, and a report is a
// fixed light/print artifact that never follows the app's light/dark theme toggle anyway.
const SCOPE_COLOR: Record<string, string> = {
  SCOPE_1: "#1d9764",
  SCOPE_2: "#eb6428",
  SCOPE_3: "#4c71b1",
};
const BRAND_NAVY = "#002060";

// The running header is absolutely positioned, so the page's own top padding has to be derived
// from these rather than guessed; see styles.page.
const HEADER_TOP = 26;
const HEADER_HEIGHT = 38;

// Loaded once per module, not per request. react-pdf's server-side render cannot fetch a
// `/public` URL, so the asset is read directly; the export route pins runtime = "nodejs".
const logoBuffer = readFileSync(path.join(process.cwd(), "public", "logo-square.png"));

const tonnesFmt = new Intl.NumberFormat("es-CO", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 3,
});
const dateFmt = new Intl.DateTimeFormat("es-CO", {
  dateStyle: "long",
  timeStyle: "short",
  timeZone: "America/Bogota",
});

const t = (n: number) => `${tonnesFmt.format(n)} t CO2e`;

const factorFmt = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 6 });
const qtyFmt = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 3 });

// Display-only, like build-workbook.ts's own num() helper: the Decimal string is never fed
// back into a calculation, only formatted for this one cell.
function factorCell(value: string | null, unit: string | null): string {
  if (value === null) return "-";
  const parsed = Number(value);
  const text = Number.isFinite(parsed) ? factorFmt.format(parsed) : value;
  return unit ? `${text} ${unit}` : text;
}

const styles = StyleSheet.create({
  // The top padding must clear the fixed running header (which is drawn outside the flow), and
  // the bottom padding must clear the fixed footer. Getting these wrong is exactly how content
  // ends up printed underneath the logo on page 2 onward.
  page: {
    paddingTop: HEADER_TOP + HEADER_HEIGHT + 18,
    paddingBottom: 48,
    paddingHorizontal: 40,
    fontSize: 10,
    color: "#1a1a1a",
    fontFamily: "Helvetica",
  },
  header: {
    position: "absolute",
    top: HEADER_TOP,
    left: 40,
    right: 40,
    height: HEADER_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 0.5,
    borderBottomColor: "#e0e0e0",
  },
  headerTitle: { fontSize: 8, fontFamily: "Helvetica-Bold", color: BRAND_NAVY },
  headerMeta: { fontSize: 7.5, color: "#888", marginTop: 2 },
  logo: { width: 32, height: 32 },
  h1: { fontSize: 18, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  sub: { fontSize: 10, color: "#666", marginBottom: 16 },
  section: { marginTop: 18 },
  sectionTitle: { fontSize: 12, fontFamily: "Helvetica-Bold", marginBottom: 6 },
  kpiRow: { flexDirection: "row", gap: 10 },
  kpiBox: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 4,
    padding: 10,
  },
  kpiLabel: { fontSize: 8, color: "#666", textTransform: "uppercase" },
  kpiValue: { fontSize: 16, fontFamily: "Helvetica-Bold", marginTop: 2 },
  kpiPct: { fontSize: 8, color: "#666", marginTop: 1 },
  barTrack: {
    flexDirection: "row",
    height: 10,
    borderRadius: 3,
    overflow: "hidden",
    marginTop: 10,
    backgroundColor: "#eee",
  },
  legendRow: { flexDirection: "row", gap: 14, marginTop: 6 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  legendSwatch: { width: 8, height: 8, borderRadius: 2 },
  legendText: { fontSize: 8, color: "#666" },
  row: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#e5e5e5",
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  // Marked `fixed` at every call site: when a section splits across pages, react-pdf's layout
  // engine copies its fixed children onto the continuation, so the column headings reappear at
  // the top of each page the table runs onto instead of leaving orphaned numbers.
  headRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#999",
    paddingVertical: 4,
    paddingHorizontal: 4,
    backgroundColor: "#f4f5f7",
  },
  th: { fontFamily: "Helvetica-Bold", fontSize: 9 },
  cellName: { flex: 4, paddingRight: 8 },
  cellScope: { flex: 2, paddingRight: 8, color: "#666" },
  cellNum: { flex: 2, textAlign: "right" },
  // The element results table needs finer-grained columns than the 3-column layout above.
  resElement: { flex: 3, paddingRight: 6 },
  resCategory: { flex: 2, paddingRight: 6, color: "#666" },
  resScope: { flex: 1.3, paddingRight: 6, color: "#666" },
  resQty: { flex: 1.5, textAlign: "right", paddingRight: 6 },
  resFactor: { flex: 1.6, textAlign: "right", paddingRight: 6 },
  resTonnes: { flex: 1.2, textAlign: "right" },
  note: { fontSize: 9, color: "#555", marginTop: 4 },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 40,
    right: 40,
    fontSize: 8,
    color: "#999",
    textAlign: "center",
  },
});

function KeyVal({ k, v }: { k: string; v: string }) {
  return (
    <View style={{ flexDirection: "row", marginBottom: 2 }}>
      <Text style={{ width: 90, color: "#666" }}>{k}</Text>
      <Text>{v}</Text>
    </View>
  );
}

function ReportDocument({ vm }: { vm: ReportVM }) {
  const facilityLabel = vm.facilityName ?? "Todas las sedes";
  const bySede = [...vm.bySede].sort((a, b) => b.tonnes - a.tonnes);
  const categories = [...vm.byCategory].sort((a, b) => b.tonnes - a.tonnes).slice(0, 14);
  // The full (untruncated) category list, so this reconciles to totalTonnes exactly - unlike
  // `categories` above, which is capped at 14 rows for the "Emisiones por categoría" table.
  const isoGasTable = buildIsoGasTable(vm.byCategory);
  // The complete element-by-element reference, unlike the top-14-truncated category rollup
  // above: this table's entire purpose is being the detailed audit trail.
  const elements: ResultRow[] = [...vm.results].sort((a, b) => b.tonnes - a.tonnes);
  // Uncertainty is a per-element disclosure; list the priced elements, uncertainty or not.
  const uncertainty: ResultRow[] = elements;
  const anyUncertainty = uncertainty.some((r) => r.uncertaintyPct !== null);

  // Zero new arithmetic: a pure display ratio of numbers rollupYear already computed, the same
  // pattern already used for the dashboard's own percentages.
  const total = vm.totalTonnes;
  const pctOf = (value: number) => (total > 0 ? (value / total) * 100 : 0);

  return (
    <Document
      title={`Huella de Carbono ${vm.companyName} ${vm.year}`}
      author="CECODES - Huella de Carbono"
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.header} fixed>
          {/* Page 1 carries the full title block below, so the running text would only repeat
              itself there; it starts on the continuation pages, where it is the only thing
              saying what the reader is looking at. */}
          <View>
            <Text
              style={styles.headerTitle}
              render={({ pageNumber }) =>
                pageNumber === 1 ? "" : "HUELLA DE CARBONO CORPORATIVA"
              }
            />
            <Text
              style={styles.headerMeta}
              render={({ pageNumber }) =>
                pageNumber === 1
                  ? ""
                  : `${vm.companyName} - ${facilityLabel} - ${vm.year}`
              }
            />
          </View>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf/renderer's Image is not an
              HTML img (it renders into a PDF content stream, not a DOM); its type has no alt prop. */}
          <Image src={logoBuffer} style={styles.logo} />
        </View>
        <Text style={styles.h1}>Huella de Carbono Corporativa</Text>
        <Text style={styles.sub}>
          {vm.companyName} - {facilityLabel} - {vm.year}
        </Text>

        <View style={styles.kpiRow}>
          <View style={[styles.kpiBox, { flex: 1.4, borderColor: BRAND_NAVY }]}>
            <Text style={styles.kpiLabel}>Huella total</Text>
            <Text style={[styles.kpiValue, { fontSize: 20, color: BRAND_NAVY }]}>
              {t(total)}
            </Text>
          </View>
          {vm.byScope.map((s) => (
            <View
              key={s.scope}
              style={[styles.kpiBox, { borderColor: SCOPE_COLOR[s.scope] }]}
            >
              <Text style={styles.kpiLabel}>{SCOPE_LABEL[s.scope]}</Text>
              <Text style={[styles.kpiValue, { color: SCOPE_COLOR[s.scope] }]}>
                {t(s.tonnes)}
              </Text>
              <Text style={styles.kpiPct}>
                {tonnesFmt.format(pctOf(s.tonnes))}% del total
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.barTrack}>
          {vm.byScope.map((s) => (
            <View
              key={s.scope}
              style={{
                width: `${pctOf(s.tonnes)}%`,
                backgroundColor: SCOPE_COLOR[s.scope],
              }}
            />
          ))}
        </View>
        <View style={styles.legendRow}>
          {vm.byScope.map((s) => (
            <View key={s.scope} style={styles.legendItem}>
              <View
                style={[styles.legendSwatch, { backgroundColor: SCOPE_COLOR[s.scope] }]}
              />
              <Text style={styles.legendText}>
                {SCOPE_LABEL[s.scope]} - {tonnesFmt.format(pctOf(s.tonnes))}%
              </Text>
            </View>
          ))}
        </View>

        <View style={{ marginTop: 14 }}>
          <KeyVal k="Empresa" v={vm.companyName} />
          <KeyVal k="Sede" v={facilityLabel} />
          <KeyVal k="Año" v={String(vm.year)} />
          <KeyVal k="Fuente GWP" v={formatGwpSource(vm.gwpSet)} />
          <KeyVal k="Generado" v={dateFmt.format(vm.generatedAt)} />
        </View>

        {bySede.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle} minPresenceAhead={60}>
              Emisiones por sede
            </Text>
            <View style={styles.headRow} fixed>
              <Text style={[styles.cellName, styles.th]}>Sede</Text>
              <Text style={[styles.cellNum, styles.th]}>t CO2e</Text>
              <Text style={[styles.cellNum, styles.th]}>% del total</Text>
            </View>
            {bySede.map((s) => (
              <View key={s.facilityId} style={styles.row} wrap={false}>
                <Text style={styles.cellName}>
                  {s.facilityName}
                  {s.incomplete ? " (incompleto)" : ""}
                </Text>
                <Text style={styles.cellNum}>{t(s.tonnes)}</Text>
                <Text style={styles.cellNum}>{tonnesFmt.format(pctOf(s.tonnes))}%</Text>
              </View>
            ))}
          </View>
        ) : null}

        {categories.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle} minPresenceAhead={60}>
              Emisiones por categoría
            </Text>
            <View style={styles.headRow} fixed>
              <Text style={[styles.cellName, styles.th]}>Categoría</Text>
              <Text style={[styles.cellScope, styles.th]}>Alcance</Text>
              <Text style={[styles.cellNum, styles.th]}>t CO2e</Text>
            </View>
            {categories.map((c) => (
              <View key={`${c.scope}-${c.category}`} style={styles.row} wrap={false}>
                <Text style={styles.cellName}>{c.category}</Text>
                <Text style={styles.cellScope}>{SCOPE_LABEL[c.scope]}</Text>
                <Text style={styles.cellNum}>{t(c.tonnes)}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle} minPresenceAhead={60}>
            Declaración consolidada GEI (ISO 14064-1)
          </Text>
          <Text style={styles.note}>
            Resumen por gas de la misma huella reportada arriba (GHG Protocol / ISO 14064-1). No
            es un cálculo nuevo: cada categoría ya trae su propio desglose por gas.
          </Text>
          <View style={[styles.headRow, { marginTop: 6 }]} fixed>
            <Text style={[styles.cellName, styles.th]}>Gas</Text>
            <Text style={[styles.cellNum, styles.th]}>t CO2e</Text>
          </View>
          {isoGasTable.map((row) => (
            <View key={row.gas} style={styles.row} wrap={false}>
              <Text style={styles.cellName}>{row.gas}</Text>
              <Text style={styles.cellNum}>{t(row.tonnes)}</Text>
            </View>
          ))}
          <View style={styles.row} wrap={false}>
            <Text style={[styles.cellName, styles.th]}>TOTAL</Text>
            <Text style={[styles.cellNum, styles.th]}>{t(total)}</Text>
          </View>
        </View>

        {elements.length > 0 ? (
          <View style={styles.section} wrap>
            <Text style={styles.sectionTitle} minPresenceAhead={60}>
              Resumen por elemento
            </Text>
            <View style={styles.headRow} fixed>
              <Text style={[styles.resElement, styles.th]}>Elemento</Text>
              <Text style={[styles.resCategory, styles.th]}>Categoría</Text>
              <Text style={[styles.resScope, styles.th]}>Alcance</Text>
              <Text style={[styles.resQty, styles.th]}>Cantidad</Text>
              <Text style={[styles.resFactor, styles.th]}>Factor</Text>
              <Text style={[styles.resTonnes, styles.th]}>t CO2e</Text>
            </View>
            {elements.map((r) => (
              <View
                key={`${r.scope}-${r.category}-${r.subcategory}-${r.element}`}
                style={styles.row}
                wrap={false}
              >
                <Text style={styles.resElement}>{r.element}</Text>
                <Text style={styles.resCategory}>{r.category}</Text>
                <Text style={styles.resScope}>{SCOPE_LABEL[r.scope]}</Text>
                <Text style={styles.resQty}>
                  {qtyFmt.format(r.quantity)} {r.unit}
                  {r.secondaryQuantity !== null
                    ? ` x ${qtyFmt.format(r.secondaryQuantity)} ${r.secondaryUnit}`
                    : ""}
                </Text>
                <Text style={styles.resFactor}>{factorCell(r.factorValue, r.factorUnit)}</Text>
                <Text style={styles.resTonnes}>{tonnesFmt.format(r.tonnes)}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {vm.removals.rows.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle} minPresenceAhead={90}>
              Remociones o absorciones de carbono
            </Text>
            <Text style={styles.note}>
              Se reportan por separado, como en la herramienta de CECODES: no se suman ni se
              restan del total de emisiones.
            </Text>
            <View style={[styles.headRow, { marginTop: 6 }]} fixed>
              <Text style={[styles.cellName, styles.th]}>Elemento</Text>
              <Text style={[styles.cellNum, styles.th]}>t CO2e</Text>
            </View>
            {vm.removals.rows.map((r) => (
              <View key={`${r.subcategory}-${r.element}`} style={styles.row} wrap={false}>
                <Text style={styles.cellName}>{r.element}</Text>
                <Text style={styles.cellNum}>{t(r.tonnes)}</Text>
              </View>
            ))}
            <View style={styles.row} wrap={false}>
              <Text style={[styles.cellName, styles.th]}>Total remociones</Text>
              <Text style={[styles.cellNum, styles.th]}>{t(vm.removals.tonnes)}</Text>
            </View>
          </View>
        ) : null}

        {vm.cleanTech.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle} minPresenceAhead={90}>
              Datos sobre tecnologías más limpias y buenas prácticas
            </Text>
            <Text style={styles.note}>
              Sección informativa reportada de manera libre por la empresa. No afecta ningún
              cálculo ni total de este reporte.
            </Text>
            <View style={[styles.headRow, { marginTop: 6 }]} fixed>
              <Text style={[styles.cellName, styles.th]}>Práctica reportable</Text>
              <Text style={[styles.cellScope, styles.th]}>Alcance</Text>
              <Text style={[styles.cellNum, styles.th]}>Dato / Unidad</Text>
            </View>
            {vm.cleanTech.map((row, index) => (
              <View key={`${row.element}-${index}`} style={styles.row} wrap={false}>
                <Text style={styles.cellName}>{row.element}</Text>
                <Text style={styles.cellScope}>
                  {row.scope ? SCOPE_LABEL[row.scope] : "-"}
                </Text>
                <Text style={styles.cellNum}>
                  {row.quantity ?? "-"}
                  {row.unit ? ` ${row.unit}` : ""}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle} minPresenceAhead={110}>
            Incertidumbre por elemento
          </Text>
          <Text style={styles.note}>
            Rango +/- del factor de emisión, por elemento. Un guion indica que la biblioteca no
            registra incertidumbre para ese elemento. No se combina en un solo valor por alcance o
            total: no existe un método acordado para hacerlo.
          </Text>
          <View style={[styles.headRow, { marginTop: 6 }]} fixed>
            <Text style={[styles.cellName, styles.th]}>Elemento</Text>
            <Text style={[styles.cellScope, styles.th]}>Alcance</Text>
            <Text style={[styles.cellNum, styles.th]}>Incertidumbre</Text>
          </View>
          {uncertainty.map((r) => (
            <View key={`${r.scope}-${r.category}-${r.element}`} style={styles.row} wrap={false}>
              <Text style={styles.cellName}>{r.element}</Text>
              <Text style={styles.cellScope}>{SCOPE_LABEL[r.scope]}</Text>
              <Text style={styles.cellNum}>
                {r.uncertaintyPct === null ? "-" : `+/- ${r.uncertaintyPct}%`}
              </Text>
            </View>
          ))}
          {!anyUncertainty ? (
            <Text style={styles.note}>
              La biblioteca no registra incertidumbre para los elementos de este reporte.
            </Text>
          ) : null}
        </View>

        {vm.missingGridFactor || vm.biogenicCo2Tonnes > 0 || vm.unpricedCount > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle} minPresenceAhead={40}>
              Notas y advertencias
            </Text>
            {vm.missingGridFactor ? (
              <Text style={styles.note}>
                Falta el factor de red eléctrica para {vm.year}: el Alcance 2 no incluye la
                electricidad hasta que un administrador lo cargue.
              </Text>
            ) : null}
            {vm.biogenicCo2Tonnes > 0 ? (
              <Text style={styles.note}>
                Incluye {tonnesFmt.format(vm.biogenicCo2Tonnes)} t CO2 de origen biogénico
                {vm.biogenicCo2Partial ? " (parcial)" : ""}, que el Protocolo GHG reporta por
                separado.
              </Text>
            ) : null}
            {vm.unpricedCount > 0 ? (
              <Text style={styles.note}>
                {vm.unpricedCount} elemento(s) con datos pero sin factor válido no se incluyen en
                el total.
              </Text>
            ) : null}
          </View>
        ) : null}

        <Text
          style={styles.footer}
          render={({ pageNumber, totalPages }) =>
            `Huella de Carbono CECODES - Estimación referencial - Página ${pageNumber} de ${totalPages}`
          }
          fixed
        />
      </Page>
    </Document>
  );
}

export function buildPdf(vm: ReportVM): Promise<Buffer> {
  return renderToBuffer(<ReportDocument vm={vm} />);
}
