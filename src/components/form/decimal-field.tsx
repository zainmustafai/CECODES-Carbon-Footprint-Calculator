"use client";

import * as React from "react";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type DecimalFieldProps = Omit<React.ComponentProps<"input">, "type"> & {
  label: string;
  unit?: string;
  error?: string;
  hint?: string;
};

// A non-negative decimal quantity or factor. RHF-compatible via forwardRef + register().
//
// type="text" with inputMode="decimal", never type="number":
//  - es-CO types a decimal comma, which type="number" either rejects or mangles per browser.
//  - a number input round-trips through float64, which cannot hold Decimal(20,6) exactly.
// The value stays a string from here to Postgres. Validation is the shared regex in
// @/lib/decimal-input.
export const DecimalField = React.forwardRef<HTMLInputElement, DecimalFieldProps>(
  function DecimalField(
    { label, unit, error, hint, id, name, className, ...props },
    ref,
  ) {
    // Generated, never the field name: two forms sharing a page can hold the same field name, and
    // duplicate DOM ids silently bind a label to the wrong input. See the note in text-field.tsx.
    const generatedId = React.useId();
    const fieldId = id ?? generatedId;
    const errorId = error ? `${fieldId}-error` : undefined;
    const hintId = hint ? `${fieldId}-hint` : undefined;
    const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;

    return (
      <div className="grid gap-2">
        <Label htmlFor={fieldId}>{label}</Label>
        <InputGroup>
          <InputGroupInput
            id={fieldId}
            name={name}
            ref={ref}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            className={cn("text-right tabular-nums", className)}
            {...props}
          />
          {unit ? (
            <InputGroupAddon align="inline-end">
              <InputGroupText className="text-xs text-muted-foreground">
                {unit}
              </InputGroupText>
            </InputGroupAddon>
          ) : null}
        </InputGroup>
        {hint ? (
          <p id={hintId} className="text-xs text-muted-foreground">
            {hint}
          </p>
        ) : null}
        {error ? (
          <p id={errorId} className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    );
  },
);
