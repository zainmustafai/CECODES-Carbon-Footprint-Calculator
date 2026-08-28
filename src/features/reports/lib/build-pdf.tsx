import { readFileSync } from "node:fs";
import path from "node:path";
import {
  Document,
  Image,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
  Svg,
  Path,
  Rect,
  Line,
  Polyline,
  Circle,
} from "@react-pdf/renderer";
import type { ReportVM, ResultRow } from "./types";
import { formatGwpSource } from "@/lib/gwp";
import { buildIsoGasTable } from "./iso-gas-table";
import { buildParetoSeries } from "@/features/dashboard/lib/pareto";

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
// from these rather than guessed; see styles.page. Client feedback 2026-08-28: "Larger page" - A3
// instead of A4 (roughly 2x the area), so every constant below is retuned for that canvas, not
// just the page size prop.
const PAGE_HORIZONTAL_PADDING = 54;
const HEADER_TOP = 34;
const HEADER_HEIGHT = 50;
// The content area's usable width, for every chart below that needs a concrete pixel width rather
// than a percentage (react-pdf's Svg has no "100%" sizing the way a View does).
const CONTENT_WIDTH = 841.89 - PAGE_HORIZONTAL_PADDING * 2;

// Loaded once per module, not per request. react-pdf's server-side render cannot fetch a
// `/public` URL, so the asset is read directly; the export route pins runtime = "nodejs".
// The full wordmark (icon + "CECODES"), not the icon-only square crop - client feedback
// 2026-08-24: "Pdf report MUST include complete CECODES logo".
const logoBuffer = readFileSync(path.join(process.cwd(), "public", "logo.png"));
// Source asset is 5191x1684 (~3.083:1); render at a fixed height and the matching width so it
// never distorts.
const LOGO_HEIGHT = 30;
const LOGO_WIDTH = Math.round(LOGO_HEIGHT * (5191 / 1684));

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
    paddingTop: HEADER_TOP + HEADER_HEIGHT + 24,
    paddingBottom: 64,
    paddingHorizontal: PAGE_HORIZONTAL_PADDING,
    fontSize: 13,
    color: "#1a1a1a",
    fontFamily: "Helvetica",
  },
  header: {
    position: "absolute",
    top: HEADER_TOP,
    left: PAGE_HORIZONTAL_PADDING,
    right: PAGE_HORIZONTAL_PADDING,
    height: HEADER_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 0.5,
    borderBottomColor: "#e0e0e0",
  },
  headerTitle: { fontSize: 10, fontFamily: "Helvetica-Bold", color: BRAND_NAVY },
  headerMeta: { fontSize: 9.5, color: "#888", marginTop: 2 },
  logo: { width: LOGO_WIDTH, height: LOGO_HEIGHT },
  h1: { fontSize: 26, fontFamily: "Helvetica-Bold", marginBottom: 3 },
  sub: { fontSize: 13, color: "#666", marginBottom: 20 },
  section: { marginTop: 24 },
  sectionTitle: { fontSize: 16, fontFamily: "Helvetica-Bold", marginBottom: 8 },
  sectionSubtitle: { fontSize: 10, color: "#666", marginBottom: 8, marginTop: -4 },
  kpiRow: { flexDirection: "row", gap: 12 },
  kpiBox: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 5,
    padding: 13,
  },
  kpiLabel: { fontSize: 10, color: "#666", textTransform: "uppercase" },
  kpiValue: { fontSize: 20, fontFamily: "Helvetica-Bold", marginTop: 3 },
  kpiPct: { fontSize: 10, color: "#666", marginTop: 2 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 8 },
  legendSwatch: { width: 10, height: 10, borderRadius: 2 },
  legendText: { fontSize: 10, color: "#666" },
  // A compact "panorama" bar row: label + value on top, a thin proportional track below - one
  // row per category/gas, each track's fill width standing in for a bar chart.
  dashRow: { marginTop: 10 },
  dashRowHead: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  dashRowLabel: { fontSize: 11 },
  dashRowValue: { fontSize: 11, fontFamily: "Helvetica-Bold", color: BRAND_NAVY },
  dashRowTrack: {
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
    backgroundColor: "#eee",
  },
  dashRowFill: { height: "100%", borderRadius: 4 },
  row: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#e5e5e5",
    paddingVertical: 5,
    paddingHorizontal: 5,
  },
  // Marked `fixed` at every call site: when a section splits across pages, react-pdf's layout
  // engine copies its fixed children onto the continuation, so the column headings reappear at
  // the top of each page the table runs onto instead of leaving orphaned numbers.
  headRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#999",
    paddingVertical: 5,
    paddingHorizontal: 5,
    backgroundColor: "#f4f5f7",
  },
  th: { fontFamily: "Helvetica-Bold", fontSize: 11 },
  cellName: { flex: 4, paddingRight: 10 },
  cellScope: { flex: 2, paddingRight: 10, color: "#666" },
  cellNum: { flex: 2, textAlign: "right" },
  // The element results table needs finer-grained columns than the 3-column layout above.
  resElement: { flex: 3, paddingRight: 8 },
  resCategory: { flex: 2, paddingRight: 8, color: "#666" },
  resScope: { flex: 1.3, paddingRight: 8, color: "#666" },
  resQty: { flex: 1.5, textAlign: "right", paddingRight: 8 },
  resFactor: { flex: 1.6, textAlign: "right", paddingRight: 8 },
  resTonnes: { flex: 1.2, textAlign: "right" },
  note: { fontSize: 11, color: "#555", marginTop: 5 },
  footer: {
    position: "absolute",
    bottom: 32,
    left: PAGE_HORIZONTAL_PADDING,
    right: PAGE_HORIZONTAL_PADDING,
    fontSize: 10,
    color: "#999",
    textAlign: "center",
  },
  chartAxisLabel: { fontSize: 8.5, color: "#888" },
  chartXLabel: { fontSize: 8, color: "#666", textAlign: "center" },
});

// Arc math for the scope donut below: same geometry Recharts' <Pie> uses in the live dashboard
// (scope-donut.tsx), redrawn with plain SVG since react-pdf has no charting library server-side.
const DONUT_SIZE = 150;
const DONUT_INNER_RATIO = 0.62;

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function donutSlicePath(
  cx: number,
  cy: number,
  outerR: number,
  innerR: number,
  startAngle: number,
  endAngle: number,
) {
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  const outerStart = polarToCartesian(cx, cy, outerR, startAngle);
  const outerEnd = polarToCartesian(cx, cy, outerR, endAngle);
  const innerEnd = polarToCartesian(cx, cy, innerR, endAngle);
  const innerStart = polarToCartesian(cx, cy, innerR, startAngle);
  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${outerR} ${outerR} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${innerR} ${innerR} 0 ${largeArc} 0 ${innerStart.x} ${innerStart.y}`,
    "Z",
  ].join(" ");
}

/** The scope breakdown as an actual donut (not a bar) - client feedback 2026-08-28: the PDF
 *  should look like the real dashboard, not a stand-in for it. */
function ScopeDonutChart({
  slices,
  total,
}: {
  slices: { scope: string; tonnes: number }[];
  total: number;
}) {
  const nonZero = slices.filter((s) => s.tonnes > 0);
  const cx = DONUT_SIZE / 2;
  const cy = DONUT_SIZE / 2;
  const outerR = DONUT_SIZE / 2;
  const innerR = outerR * DONUT_INNER_RATIO;

  // A single 100% slice degenerates the arc math (start === end), so cap it just short of a
  // full circle rather than special-casing a plain <Circle> ring.
  const sweeps = nonZero.map((s) =>
    nonZero.length === 1 ? 359.99 : total > 0 ? (s.tonnes / total) * 360 : 0,
  );
  // Cumulative start angle per slice, computed from the sweeps above rather than a mutated
  // running total, since this is a component function and React Compiler forbids that.
  const starts = sweeps.reduce<number[]>((acc, sweep, i) => {
    acc.push(i === 0 ? 0 : acc[i - 1] + sweeps[i - 1]);
    return acc;
  }, []);
  const paths = nonZero.map((s, i) => ({
    scope: s.scope,
    color: SCOPE_COLOR[s.scope],
    d: donutSlicePath(cx, cy, outerR, innerR, starts[i], starts[i] + sweeps[i]),
  }));

  return (
    <View style={{ width: DONUT_SIZE, height: DONUT_SIZE }}>
      <Svg width={DONUT_SIZE} height={DONUT_SIZE} viewBox={`0 0 ${DONUT_SIZE} ${DONUT_SIZE}`}>
        {paths.map((p) => (
          <Path key={p.scope} d={p.d} fill={p.color} />
        ))}
      </Svg>
      <View
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: DONUT_SIZE,
          height: DONUT_SIZE,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={{ fontSize: 15, fontFamily: "Helvetica-Bold", color: BRAND_NAVY }}>
          {tonnesFmt.format(total)}
        </Text>
        <Text style={{ fontSize: 8.5, color: "#888" }}>t CO2e total</Text>
      </View>
    </View>
  );
}

// The client's own Pareto chart (see pareto.ts's comment: docs/sample-data/CEC-PR-F-024 -
// DASHBOARD (2025).xlsx, chart3.xml) - bars for the largest elements, descending, with a
// cumulative-% line climbing toward 100%. Cumulative % is computed over EVERY element (so the
// line's value at bar N is honest about how much of the whole footprint the top N sources cover),
// even though only the top PARETO_MAX bars are drawn - matching the same truncation-with-honesty
// pattern the "Emisiones por categoría" table already uses (`categories.slice(0, 14)`).
const PARETO_MAX = 12;
const PARETO_HEIGHT = 260;
const PARETO_LEFT_AXIS = 50;
const PARETO_RIGHT_AXIS = 44;
const PARETO_TOP = 14;
const PARETO_BOTTOM_LABELS = 50;

function ParetoChartPdf({
  elements,
}: {
  elements: { element: string; scope: string; tonnes: number }[];
}) {
  const series = buildParetoSeries(elements);
  const top = series.slice(0, PARETO_MAX);
  const plotWidth = CONTENT_WIDTH - PARETO_LEFT_AXIS - PARETO_RIGHT_AXIS;
  const plotHeight = PARETO_HEIGHT - PARETO_TOP - PARETO_BOTTOM_LABELS;
  const maxTonnes = Math.max(1e-9, ...top.map((p) => p.tonnes));
  const slot = plotWidth / Math.max(top.length, 1);
  const barWidth = slot * 0.55;
  const baseY = PARETO_TOP + plotHeight;

  const points = top.map((p, i) => {
    const cx = PARETO_LEFT_AXIS + slot * i + slot / 2;
    const barHeight = maxTonnes > 0 ? (p.tonnes / maxTonnes) * plotHeight : 0;
    const lineY = baseY - (p.cumulativePct / 100) * plotHeight;
    return {
      element: p.element,
      tonnes: p.tonnes,
      scope: elements[i].scope,
      cx,
      barHeight,
      lineY,
    };
  });

  const linePoints = points.map((p) => `${p.cx},${p.lineY}`).join(" ");
  const truncate = (value: string) => (value.length > 12 ? `${value.slice(0, 11)}…` : value);

  return (
    <View>
      <Svg width={CONTENT_WIDTH} height={PARETO_HEIGHT}>
        {/* Left (tonnes) and bottom axis lines */}
        <Line
          x1={PARETO_LEFT_AXIS}
          y1={PARETO_TOP}
          x2={PARETO_LEFT_AXIS}
          y2={baseY}
          stroke="#ccc"
          strokeWidth={0.75}
        />
        <Line
          x1={PARETO_LEFT_AXIS}
          y1={baseY}
          x2={PARETO_LEFT_AXIS + plotWidth}
          y2={baseY}
          stroke="#ccc"
          strokeWidth={0.75}
        />
        {/* Left axis ticks: 0 / half / max tonnes */}
        {[0, 0.5, 1].map((f) => (
          <Text
            key={f}
            x={0}
            y={baseY - plotHeight * f + 3}
            style={{ fontSize: 8, fill: "#888" }}
          >
            {tonnesFmt.format(maxTonnes * f)}
          </Text>
        ))}
        {/* Right axis ticks: cumulative 0/50/100% */}
        {[0, 50, 100].map((pct) => (
          <Text
            key={pct}
            x={PARETO_LEFT_AXIS + plotWidth + 6}
            y={baseY - (pct / 100) * plotHeight + 3}
            style={{ fontSize: 8, fill: "#7c3aed" }}
          >
            {pct}%
          </Text>
        ))}
        {/* Bars: one per element, coloured by its Alcance like category-bars.tsx's own convention */}
        {points.map((p) => (
          <Rect
            key={`bar-${p.element}`}
            x={p.cx - barWidth / 2}
            y={baseY - p.barHeight}
            width={barWidth}
            height={Math.max(p.barHeight, p.tonnes > 0 ? 1 : 0)}
            fill={SCOPE_COLOR[p.scope]}
            rx={2}
          />
        ))}
        {/* Cumulative-% line + dots */}
        {points.length > 1 ? (
          <Polyline points={linePoints} stroke="#7c3aed" strokeWidth={1.5} fill="none" />
        ) : null}
        {points.map((p) => (
          <Circle key={`dot-${p.element}`} cx={p.cx} cy={p.lineY} r={2.4} fill="#7c3aed" />
        ))}
        {/* X-axis element labels */}
        {points.map((p) => (
          <Text
            key={`label-${p.element}`}
            x={p.cx}
            y={baseY + 14}
            style={{ fontSize: 8, fill: "#666", textAnchor: "middle" }}
          >
            {truncate(p.element)}
          </Text>
        ))}
      </Svg>
      <Text style={styles.note}>
        Barras: t CO2e por elemento (eje izquierdo). Línea: % acumulado del total (eje derecho).
        {elements.length > PARETO_MAX
          ? ` Se muestran los ${PARETO_MAX} elementos de mayor emisión.`
          : ""}
      </Text>
    </View>
  );
}

// The monthly trend, Scope 2 (electricity) only - a month nobody reported is a gap in the line,
// never a dip to zero, matching monthly-trend.tsx's own rule exactly.
const MONTHLY_HEIGHT = 200;
const MONTHLY_LEFT_AXIS = 50;
const MONTHLY_TOP = 14;
const MONTHLY_BOTTOM_LABELS = 30;
const MONTH_LABELS = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];

function MonthlyTrendChartPdf({ points }: { points: { month: number; tonnes: number | null }[] }) {
  const hasAny = points.some((p) => p.tonnes !== null);
  if (!hasAny) {
    return (
      <Text style={styles.note}>
        Sin datos mensuales de Alcance 2 (electricidad) para este año.
      </Text>
    );
  }

  const plotWidth = CONTENT_WIDTH - MONTHLY_LEFT_AXIS;
  const plotHeight = MONTHLY_HEIGHT - MONTHLY_TOP - MONTHLY_BOTTOM_LABELS;
  const maxTonnes = Math.max(1e-9, ...points.map((p) => p.tonnes ?? 0));
  const baseY = MONTHLY_TOP + plotHeight;
  const slot = plotWidth / (points.length - 1 || 1);

  const coords = points.map((p, i) => ({
    month: p.month,
    tonnes: p.tonnes,
    x: MONTHLY_LEFT_AXIS + slot * i,
    y: p.tonnes === null ? null : baseY - (p.tonnes / maxTonnes) * plotHeight,
  }));

  // Split into contiguous runs of reported months, so a gap breaks the line instead of drawing a
  // straight segment across a month nobody entered.
  const segments: { x: number; y: number }[][] = [];
  let current: { x: number; y: number }[] = [];
  for (const c of coords) {
    if (c.y === null) {
      if (current.length > 0) segments.push(current);
      current = [];
      continue;
    }
    current.push({ x: c.x, y: c.y });
  }
  if (current.length > 0) segments.push(current);

  return (
    <Svg width={CONTENT_WIDTH} height={MONTHLY_HEIGHT}>
      <Line
        x1={MONTHLY_LEFT_AXIS}
        y1={MONTHLY_TOP}
        x2={MONTHLY_LEFT_AXIS}
        y2={baseY}
        stroke="#ccc"
        strokeWidth={0.75}
      />
      <Line
        x1={MONTHLY_LEFT_AXIS}
        y1={baseY}
        x2={MONTHLY_LEFT_AXIS + plotWidth}
        y2={baseY}
        stroke="#ccc"
        strokeWidth={0.75}
      />
      {[0, 0.5, 1].map((f) => (
        <Text key={f} x={0} y={baseY - plotHeight * f + 3} style={{ fontSize: 8, fill: "#888" }}>
          {tonnesFmt.format(maxTonnes * f)}
        </Text>
      ))}
      {segments.map((seg, i) => (
        <Polyline
          key={`seg-${i}`}
          points={seg.map((c) => `${c.x},${c.y}`).join(" ")}
          stroke={SCOPE_COLOR.SCOPE_2}
          strokeWidth={1.75}
          fill="none"
        />
      ))}
      {coords
        .filter((c) => c.y !== null)
        .map((c) => (
          <Circle key={`dot-${c.month}`} cx={c.x} cy={c.y as number} r={2.2} fill={SCOPE_COLOR.SCOPE_2} />
        ))}
      {coords.map((c) => (
        <Text
          key={`label-${c.month}`}
          x={c.x}
          y={baseY + 14}
          style={{ fontSize: 8, fill: "#666", textAnchor: "middle" }}
        >
          {MONTH_LABELS[c.month - 1]}
        </Text>
      ))}
    </Svg>
  );
}

function KeyVal({ k, v }: { k: string; v: string }) {
  return (
    <View style={{ flexDirection: "row", marginBottom: 3 }}>
      <Text style={{ width: 140, color: "#666" }}>{k}</Text>
      <Text>{v}</Text>
    </View>
  );
}

// One row of the "Panorama" dashboard summary: label + value, then a thin bar proportional to
// the row's share of `total` (width-as-percentage, the same technique dashRowFill uses).
function DashRow({
  label,
  tonnes,
  total,
  color,
}: {
  label: string;
  tonnes: number;
  total: number;
  color: string;
}) {
  const pct = total > 0 ? (tonnes / total) * 100 : 0;
  return (
    <View style={styles.dashRow} wrap={false}>
      <View style={styles.dashRowHead}>
        <Text style={styles.dashRowLabel}>{label}</Text>
        <Text style={styles.dashRowValue}>{t(tonnes)}</Text>
      </View>
      <View style={styles.dashRowTrack}>
        <View style={[styles.dashRowFill, { width: `${Math.max(pct, tonnes > 0 ? 1 : 0)}%`, backgroundColor: color }]} />
      </View>
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

  // A filtered ("download this view") PDF says so - the same self-describing rule the numbers
  // themselves already follow (this reconciles to whatever filterReportVM narrowed).
  const { scope: appliedScope, category: appliedCategory } = vm.appliedFilters;
  const hasAppliedFilters = appliedScope.length > 0 || appliedCategory !== null;
  const appliedFiltersLabel = [
    appliedScope.length > 0 ? appliedScope.map((s) => SCOPE_LABEL[s]).join(", ") : null,
    appliedCategory,
  ]
    .filter((v): v is string => v !== null)
    .join(" · ");

  // Monthly trend is Scope 2 (electricity) only - showing it while the filter excludes Scope 2
  // entirely would draw a chart with nothing behind it, exactly like dashboard-screen.tsx's own
  // conditional for the same chart.
  const showMonthlyTrend = appliedScope.length === 0 || appliedScope.includes("SCOPE_2");

  return (
    <Document
      title={`Huella de Carbono ${vm.companyName} ${vm.year}`}
      author="CECODES - Huella de Carbono"
    >
      <Page size="A3" style={styles.page}>
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
            <Text style={[styles.kpiValue, { fontSize: 27, color: BRAND_NAVY }]}>
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

        <View style={{ flexDirection: "row", alignItems: "center", gap: 20, marginTop: 14 }}>
          <ScopeDonutChart slices={vm.byScope} total={total} />
          <View style={{ flex: 1 }}>
            {vm.byScope.map((s) => (
              <View key={s.scope} style={styles.legendItem}>
                <View
                  style={[styles.legendSwatch, { backgroundColor: SCOPE_COLOR[s.scope] }]}
                />
                <Text style={styles.legendText}>
                  {SCOPE_LABEL[s.scope]} - {t(s.tonnes)} - {tonnesFmt.format(pctOf(s.tonnes))}%
                </Text>
              </View>
            ))}
          </View>
        </View>

        <View style={{ marginTop: 14 }}>
          <KeyVal k="Empresa" v={vm.companyName} />
          <KeyVal k="Sede" v={facilityLabel} />
          <KeyVal k="Año" v={String(vm.year)} />
          <KeyVal k="Fuente GWP" v={formatGwpSource(vm.gwpSet)} />
          <KeyVal k="Generado" v={dateFmt.format(vm.generatedAt)} />
          {hasAppliedFilters ? (
            <KeyVal k="Filtros aplicados" v={appliedFiltersLabel} />
          ) : null}
        </View>

        {/* A compact visual panorama, ahead of the detailed tables below - client feedback
            2026-08-24: "Include dashboard before the tables". Mirrors the two cards the live
            dashboard leads with (category breakdown, gas breakdown), redrawn with the same plain
            View-bar technique the scope bar above already uses (react-pdf has no charting
            library available server-side). */}
        {categories.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle} minPresenceAhead={100}>
              Panorama por categoría
            </Text>
            {categories.slice(0, 8).map((c) => (
              <DashRow
                key={`${c.scope}-${c.category}`}
                label={`${c.category} (${SCOPE_LABEL[c.scope]})`}
                tonnes={c.tonnes}
                total={total}
                color={BRAND_NAVY}
              />
            ))}
          </View>
        ) : null}

        {isoGasTable.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle} minPresenceAhead={100}>
              Panorama por gas
            </Text>
            {isoGasTable.map((g) => (
              <DashRow key={g.gas} label={g.gas} tonnes={g.tonnes} total={total} color="#7c3aed" />
            ))}
          </View>
        ) : null}

        {elements.length > 0 ? (
          <View style={styles.section} wrap={false}>
            <Text style={styles.sectionTitle} minPresenceAhead={PARETO_HEIGHT + 40}>
              Priorización de fuentes de emisión (Pareto)
            </Text>
            <Text style={styles.sectionSubtitle}>
              Qué priorizar primero: elementos ordenados de mayor a menor, con el % acumulado del
              total.
            </Text>
            <ParetoChartPdf elements={elements} />
          </View>
        ) : null}

        {showMonthlyTrend ? (
          <View style={styles.section} wrap={false}>
            <Text style={styles.sectionTitle} minPresenceAhead={MONTHLY_HEIGHT + 40}>
              Tendencia mensual (Alcance 2 - electricidad)
            </Text>
            <MonthlyTrendChartPdf points={vm.monthly} />
          </View>
        ) : null}

        {bySede.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle} minPresenceAhead={80}>
              Emisiones por sede
            </Text>
            {bySede.map((s) => (
              <DashRow
                key={`bar-${s.facilityId}`}
                label={s.facilityName}
                tonnes={s.tonnes}
                total={total}
                color={BRAND_NAVY}
              />
            ))}
            <View style={[styles.headRow, { marginTop: 10 }]} fixed>
              <Text style={[styles.cellName, styles.th]}>Sede</Text>
              <Text style={[styles.cellNum, styles.th]}>t CO2e</Text>
              <Text style={[styles.cellNum, styles.th]}>%</Text>
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
            <Text style={styles.sectionTitle} minPresenceAhead={80}>
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
          <Text style={styles.sectionTitle} minPresenceAhead={100}>
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
            <Text style={styles.sectionTitle} minPresenceAhead={80}>
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
            <Text style={styles.sectionTitle} minPresenceAhead={110}>
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
            <Text style={styles.sectionTitle} minPresenceAhead={110}>
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
          <Text style={styles.sectionTitle} minPresenceAhead={130}>
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
            `Huella de Carbono CECODES - Página ${pageNumber} de ${totalPages}`
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
