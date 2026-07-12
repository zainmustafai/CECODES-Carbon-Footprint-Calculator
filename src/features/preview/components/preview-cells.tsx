import { getFormatter, getTranslations } from "next-intl/server";
import type { SourceEstimate } from "@/lib/calc/preview";

// The estimated tonnes for one source. An unpriced source (no factor, or Scope 2 with no grid
// factor loaded) never shows a fake 0: it shows a dash, and the scope banner explains why.
export async function EstimateCell({
  estimate,
  hasQuantity,
}: {
  estimate: SourceEstimate;
  hasQuantity: boolean;
}) {
  const t = await getTranslations("preview");
  const format = await getFormatter();

  if (estimate.kind !== "ok") {
    return <span className="text-muted-foreground">{"—"}</span>;
  }
  if (!hasQuantity) {
    return <span className="text-muted-foreground">{t("notReported")}</span>;
  }
  return <>{format.number(estimate.tonnes, { maximumFractionDigits: 2 })}</>;
}

// The factor that priced the source, or the reason it could not be priced.
export async function FactorCell({ estimate }: { estimate: SourceEstimate }) {
  const t = await getTranslations("preview");
  const format = await getFormatter();

  if (estimate.kind === "missingGridFactor") {
    return <span className="text-muted-foreground">{t("missingGrid")}</span>;
  }
  if (estimate.kind === "noFactor") {
    return <span className="text-muted-foreground">{t("noFactor")}</span>;
  }
  if (estimate.factorValue === null) {
    return <span className="text-muted-foreground">{"—"}</span>;
  }

  const value = Number(estimate.factorValue);
  const formatted = Number.isFinite(value)
    ? format.number(value, { maximumFractionDigits: 6 })
    : estimate.factorValue;

  return (
    <span>
      {formatted}
      {estimate.factorUnit ? (
        <span className="ml-1 text-muted-foreground">{estimate.factorUnit}</span>
      ) : null}
    </span>
  );
}
