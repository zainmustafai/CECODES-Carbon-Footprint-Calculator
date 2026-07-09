import * as React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type TextFieldProps = React.ComponentProps<"input"> & {
  label: string;
  error?: string;
};

// Presentational field: label + shadcn Input + error text. Wire it with RHF's register().
export const TextField = React.forwardRef<HTMLInputElement, TextFieldProps>(
  function TextField({ label, error, id, name, ...props }, ref) {
    const fieldId = id ?? name;
    const errorId = error ? `${fieldId}-error` : undefined;

    return (
      <div className="grid gap-2">
        <Label htmlFor={fieldId}>{label}</Label>
        <Input
          id={fieldId}
          name={name}
          ref={ref}
          aria-invalid={error ? true : undefined}
          aria-describedby={errorId}
          {...props}
        />
        {error ? (
          <p id={errorId} className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    );
  },
);
