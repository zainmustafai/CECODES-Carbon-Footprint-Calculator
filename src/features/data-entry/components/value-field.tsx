"use client";

import { useTranslations } from "next-intl";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";
import { cn } from "@/lib/utils";
import { useEntryValue } from "../hooks/use-entry-value";

type ValueFieldProps = {
  entryId: string;
  unit: string;
  label: string;
  /** Renders the label visibly above the field instead of only for screen readers. */
  showLabel?: boolean;
  placeholder?: string;
  className?: string;
  /** id of the shared format hint ("non-negative, decimals with a comma"). */
  describedBy?: string;
};

// The unit is always visible next to the value. The old tool hid it, and the old tool also
// stored whole numbers: the value never becomes a JS number anywhere in this path.
export function ValueField({
  entryId,
  unit,
  label,
  showLabel = false,
  placeholder,
  className,
  describedBy,
}: ValueFieldProps) {
  const t = useTranslations("dataEntry.validation");
  const { value, invalid, onChange, onBlur, readOnly } = useEntryValue(entryId);
  const fieldId = `entry-${entryId}`;
  const errorId = `${fieldId}-error`;

  return (
    <div className={cn("grid gap-1", className)}>
      <label
        htmlFor={fieldId}
        className={cn(
          "text-xs text-muted-foreground",
          showLabel ? "font-medium" : "sr-only",
        )}
      >
        {label}
      </label>
      <InputGroup>
        <InputGroupInput
          id={fieldId}
          inputMode="decimal"
          autoComplete="off"
          disabled={readOnly}
          aria-invalid={invalid || undefined}
          aria-describedby={cn(invalid && errorId, describedBy) || undefined}
          aria-label={`${label} (${unit})`}
          placeholder={placeholder}
          className="text-right tabular-nums"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
        />
        <InputGroupAddon align="inline-end">
          <InputGroupText className="text-xs text-muted-foreground">{unit}</InputGroupText>
        </InputGroupAddon>
      </InputGroup>
      {/*
        A visible reason, not just a red ring. An invalid draft is deliberately never saved
        (it stays out of the autosave batch), so without this line the pill says "Guardado"
        while the cell silently holds a value that never left the browser.
      */}
      {invalid ? (
        <p id={errorId} className="text-xs text-destructive">
          {t("valueFormat")}
        </p>
      ) : null}
    </div>
  );
}
