"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type TextFieldProps = React.ComponentProps<"input"> & {
  label: string;
  error?: string;
  startIcon?: React.ReactNode;
};

// Presentational field: label + shadcn Input (optional leading icon) + error text.
// Wire it with RHF's register().
//
// The DOM id is generated, NOT taken from the field name. It used to be `id ?? name`, and the
// moment two forms with a same-named field shared a page (the company profile and the facility
// dialog both have a "name"), the document carried two id="name" elements. A <label for="name">
// binds to the FIRST match in the document, so the facility dialog's "Planta" label silently
// pointed at the company profile's input: the wrong control for a mouse click, and the wrong
// announcement for a screen reader. useId is per-instance, so it cannot collide.
export const TextField = React.forwardRef<HTMLInputElement, TextFieldProps>(
  function TextField({ label, error, startIcon, id, name, className, ...props }, ref) {
    const generatedId = React.useId();
    const fieldId = id ?? generatedId;
    const errorId = error ? `${fieldId}-error` : undefined;

    return (
      <div className="grid gap-2">
        <Label htmlFor={fieldId}>{label}</Label>
        <div className="relative">
          {startIcon ? (
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground [&>svg]:size-4">
              {startIcon}
            </span>
          ) : null}
          <Input
            id={fieldId}
            name={name}
            ref={ref}
            aria-invalid={error ? true : undefined}
            aria-describedby={errorId}
            className={cn(startIcon && "pl-9", className)}
            {...props}
          />
        </div>
        {error ? (
          <p id={errorId} className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    );
  },
);
