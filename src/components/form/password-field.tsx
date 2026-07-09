"use client";

import * as React from "react";
import { Eye, EyeOff, Lock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type PasswordFieldProps = Omit<React.ComponentProps<"input">, "type"> & {
  label: string;
  error?: string;
  toggleLabel?: string;
};

// Password field: leading lock icon + a show/hide toggle (local UI state only).
export const PasswordField = React.forwardRef<HTMLInputElement, PasswordFieldProps>(
  function PasswordField(
    { label, error, toggleLabel, id, name, className, ...props },
    ref,
  ) {
    const [show, setShow] = React.useState(false);
    const fieldId = id ?? name;
    const errorId = error ? `${fieldId}-error` : undefined;

    return (
      <div className="grid gap-2">
        <Label htmlFor={fieldId}>{label}</Label>
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
            <Lock className="size-4" />
          </span>
          <Input
            id={fieldId}
            name={name}
            ref={ref}
            type={show ? "text" : "password"}
            aria-invalid={error ? true : undefined}
            aria-describedby={errorId}
            className={cn("px-9", className)}
            {...props}
          />
          <button
            type="button"
            onClick={() => setShow((prev) => !prev)}
            aria-label={toggleLabel}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
          >
            {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
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
