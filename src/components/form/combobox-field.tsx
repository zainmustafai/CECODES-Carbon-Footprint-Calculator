"use client";

import * as React from "react";
import { Check, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { accentInsensitiveFilter, fold } from "@/lib/text-fold";
import { cn } from "@/lib/utils";

type ComboboxFieldProps = {
  id: string;
  label: string;
  options: string[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  error?: string;
  disabled?: boolean;
  className?: string;
  emptyText: string;
  /** Renders the "use what I typed" row when nothing existing matches, e.g. `(v) => `Usar "${v}"``. */
  createLabel: (typed: string) => string;
};

// A real dropdown (visible trigger, chevron, opens on click) over a growing list of existing
// string values, with a fallback to introduce a genuinely new one. This is the fix for a
// TextField+<datalist> combo: a datalist renders as a plain text box with no dropdown
// affordance at all, which read to an admin as "there's no dropdown here."
//
// Nothing commits without an explicit selection or Enter - no accidental-blur commits of a
// half-typed value.
export function ComboboxField({
  id,
  label,
  options,
  value,
  onValueChange,
  placeholder,
  error,
  disabled,
  className,
  emptyText,
  createLabel,
}: ComboboxFieldProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const errorId = error ? `${id}-error` : undefined;

  const typed = search.trim();
  const hasExactMatch = options.some((option) => fold(option) === fold(typed));

  function select(next: string) {
    onValueChange(next);
    setOpen(false);
    setSearch("");
  }

  return (
    <div className={cn("grid gap-2", className)}>
      <Label htmlFor={id}>{label}</Label>
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setSearch("");
        }}
      >
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            disabled={disabled}
            aria-invalid={error ? true : undefined}
            aria-describedby={errorId}
            className={cn(
              "w-full justify-between font-normal",
              !value && "text-muted-foreground",
            )}
          >
            <span className="truncate">{value || placeholder}</span>
            <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[min(24rem,calc(100vw-2rem))] p-0">
          <Command filter={accentInsensitiveFilter}>
            <CommandInput
              placeholder={placeholder}
              value={search}
              onValueChange={setSearch}
            />
            <CommandList>
              {options.length === 0 && typed === "" ? (
                <CommandEmpty>{emptyText}</CommandEmpty>
              ) : null}
              {typed !== "" && !hasExactMatch ? (
                <CommandGroup>
                  <CommandItem value={typed} onSelect={() => select(typed)}>
                    {createLabel(typed)}
                  </CommandItem>
                </CommandGroup>
              ) : null}
              {options.length > 0 ? (
                <CommandGroup>
                  {options.map((option) => (
                    <CommandItem key={option} value={option} onSelect={() => select(option)}>
                      <span className="flex-1 truncate">{option}</span>
                      {option === value ? (
                        <Check className="size-4 shrink-0 text-primary" aria-hidden />
                      ) : null}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {error ? (
        <p id={errorId} className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
