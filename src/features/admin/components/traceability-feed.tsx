import { getFormatter, getTranslations } from "next-intl/server";
import { entryChangeSentenceKey } from "../lib/describe-entry-change";
import type { TraceabilityRow } from "../lib/load-traceability";

// Renders the cross-company audit as plain Spanish, one sentence per change:
// "<persona> cambió <elemento> de <antes> a <despues>", with the company, the sede-year, the
// person's role, and a relative time. No enums, no JSON, no raw action codes. Reused as the
// admin dashboard's activity panel and as the body of the dedicated /admin/traceability page.
export async function TraceabilityFeed({ rows }: { rows: TraceabilityRow[] }) {
  const t = await getTranslations("admin.traceability");
  const tm = await getTranslations("dataEntry.months");
  const format = await getFormatter();

  if (rows.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">{t("empty")}</p>;
  }

  const blank = t("blank");

  return (
    <ul className="divide-y">
      {rows.map((row) => {
        const person = row.actorName?.trim() || row.actorEmail;
        // The month rides inside the element label so the sentence reads naturally:
        // "cambio Consumo electrico (marzo) de ...".
        const element =
          row.month !== null ? `${row.element} (${tm(String(row.month))})` : row.element;
        const key = entryChangeSentenceKey(row.action, row.from);
        const phrase = t(`sentences.${key}`, {
          element,
          from: row.from ?? blank,
          to: row.to ?? blank,
          months: row.copiedMonths ?? 0,
        });

        return (
          <li key={row.id} className="flex gap-3 py-3">
            <span
              className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-medium text-secondary-foreground"
              aria-hidden
            >
              {initials(person)}
            </span>
            <div className="min-w-0 flex-1 space-y-0.5">
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{person}</span> {phrase}
              </p>
              <p className="text-xs text-muted-foreground">
                <span className="text-foreground/80">{row.companyName}</span>
                {row.facilityName ? (
                  <>
                    {" · "}
                    {row.year !== null ? t("sedeYear", { sede: row.facilityName, year: String(row.year) }) : row.facilityName}
                  </>
                ) : null}
                {" · "}
                {/* next-intl picks the unit, so es-CO reads "hace 2 horas". */}
                {format.relativeTime(row.changedAt)}
                {row.actorPosition ? <> {" · "}{row.actorPosition}</> : null}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// Up to two initials from a name ("Maria Lopez" -> "ML"); for an email, the first two letters.
function initials(who: string): string {
  const trimmed = who.trim();
  if (trimmed.includes("@")) return trimmed.slice(0, 2).toUpperCase();
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
