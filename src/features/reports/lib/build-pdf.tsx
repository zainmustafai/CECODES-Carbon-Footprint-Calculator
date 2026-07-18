import { Document, Page, Text, View, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import type { ReportVM, ResultRow } from "./types";

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

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, color: "#1a1a1a", fontFamily: "Helvetica" },
  h1: { fontSize: 18, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  sub: { fontSize: 10, color: "#666", marginBottom: 16 },
  section: { marginTop: 18 },
  sectionTitle: { fontSize: 12, fontFamily: "Helvetica-Bold", marginBottom: 6 },
  totalBox: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 4,
    padding: 12,
    marginBottom: 4,
  },
  totalLabel: { fontSize: 9, color: "#666", textTransform: "uppercase" },
  totalValue: { fontSize: 22, fontFamily: "Helvetica-Bold", marginTop: 2 },
  row: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#e5e5e5",
    paddingVertical: 4,
  },
  headRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#999",
    paddingVertical: 4,
  },
  th: { fontFamily: "Helvetica-Bold", fontSize: 9 },
  cellName: { flex: 4, paddingRight: 8 },
  cellScope: { flex: 2, paddingRight: 8, color: "#666" },
  cellNum: { flex: 2, textAlign: "right" },
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
  const categories = [...vm.byCategory].sort((a, b) => b.tonnes - a.tonnes).slice(0, 14);
  // Uncertainty is a per-element disclosure; list the priced elements, uncertainty or not.
  const uncertainty: ResultRow[] = [...vm.results].sort((a, b) => b.tonnes - a.tonnes);
  const anyUncertainty = uncertainty.some((r) => r.uncertaintyPct !== null);

  return (
    <Document
      title={`Huella de Carbono ${vm.companyName} ${vm.year}`}
      author="CECODES - Huella de Carbono"
    >
      <Page size="A4" style={styles.page}>
        <Text style={styles.h1}>Huella de Carbono Corporativa</Text>
        <Text style={styles.sub}>
          {vm.companyName} - {vm.facilityName} - {vm.year}
        </Text>

        <View style={styles.totalBox}>
          <Text style={styles.totalLabel}>Huella total</Text>
          <Text style={styles.totalValue}>{t(vm.totalTonnes)}</Text>
        </View>

        <View style={{ marginTop: 8 }}>
          <KeyVal k="Empresa" v={vm.companyName} />
          <KeyVal k="Sede" v={vm.facilityName} />
          <KeyVal k="Año" v={String(vm.year)} />
          <KeyVal k="Conjunto GWP" v={vm.gwpSet} />
          <KeyVal k="Generado" v={dateFmt.format(vm.generatedAt)} />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Emisiones por alcance</Text>
          {vm.byScope.map((s) => (
            <View key={s.scope} style={styles.row}>
              <Text style={styles.cellName}>{SCOPE_LABEL[s.scope]}</Text>
              <Text style={styles.cellNum}>{t(s.tonnes)}</Text>
            </View>
          ))}
        </View>

        {categories.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Emisiones por categoría</Text>
            <View style={styles.headRow}>
              <Text style={[styles.cellName, styles.th]}>Categoría</Text>
              <Text style={[styles.cellScope, styles.th]}>Alcance</Text>
              <Text style={[styles.cellNum, styles.th]}>t CO2e</Text>
            </View>
            {categories.map((c) => (
              <View key={`${c.scope}-${c.category}`} style={styles.row}>
                <Text style={styles.cellName}>{c.category}</Text>
                <Text style={styles.cellScope}>{SCOPE_LABEL[c.scope]}</Text>
                <Text style={styles.cellNum}>{t(c.tonnes)}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Incertidumbre por elemento</Text>
          <Text style={styles.note}>
            Rango +/- del factor de emisión, por elemento. Un guion indica que la biblioteca no
            registra incertidumbre para ese elemento. No se combina en un solo valor por alcance o
            total: no existe un método acordado para hacerlo.
          </Text>
          <View style={[styles.headRow, { marginTop: 6 }]}>
            <Text style={[styles.cellName, styles.th]}>Elemento</Text>
            <Text style={[styles.cellScope, styles.th]}>Alcance</Text>
            <Text style={[styles.cellNum, styles.th]}>Incertidumbre</Text>
          </View>
          {uncertainty.map((r) => (
            <View key={`${r.scope}-${r.category}-${r.element}`} style={styles.row}>
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
            <Text style={styles.sectionTitle}>Notas y advertencias</Text>
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

        <Text style={styles.note} render={() => ""} fixed />
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
