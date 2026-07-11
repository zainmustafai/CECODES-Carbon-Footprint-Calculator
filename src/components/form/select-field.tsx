"use client";

import * as React from "react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type SelectFieldOption = { value: string; label: string };

type SelectFieldProps = {
  id: string;
  label: string;
  options: SelectFieldOption[];
  value: string | undefined;
  onValueChange: (value: string) => void;
  placeholder?: string;
  error?: string;
  disabled?: boolean;
  className?: string;
  triggerClassName?: string;
};

// Label + Radix Select + error text, associated the way a native field would be.
//
// Radix's trigger is a button, so `Label htmlFor` points at the trigger's id: a wrapping
// label does not expose the accessible name to the trigger. Radix Select is not a native
// input, so React Hook Form must drive it through <Controller>, not register().
export function SelectField({
  id,
  label,
  options,
  value,
  onValueChange,
  placeholder,
  error,
  disabled,
  className,
  triggerClassName,
}: SelectFieldProps) {
  const errorId = error ? `${id}-error` : undefined;

  return (
    <div className={cn("grid gap-2", className)}>
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={onValueChange} disabled={disabled}>
        <SelectTrigger
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={errorId}
          className={cn("w-full", triggerClassName)}
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error ? (
        <p id={errorId} className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
