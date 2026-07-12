"use client";

import { forwardRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import type { FactorCategory } from "../lib/types";
import { useSourceActions } from "../hooks/use-source-actions";

type AddSourceDialogProps = {
  category: FactorCategory | undefined;
  existingFactorIds: string[];
  disabled?: boolean;
  /** Runs once the add has settled. An empty category renders as a one-line row, so adding the
   *  first source turns the section into a card and unmounts this very trigger; focus would
   *  otherwise fall to <body>. */
  onAdded?: () => void;
};

// Fold accents away before matching: the factor library carries the Excel's accented Spanish
// names ("Diésel", "Carbón Genérico", "Líquidos") and Colombian users routinely type without
// accents, especially in a search box. cmdk's default scorer does not fold diacritics, so
// "carbon" would find nothing.
function fold(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

function accentInsensitiveFilter(value: string, search: string): number {
  return fold(value).includes(fold(search.trim())) ? 1 : 0;
}

// Element names come from the factor library, so a company cannot invent or misspell one.
// Already-added elements stay visible but unselectable, which is clearer than hiding them.
//
// The trigger takes a ref: it is the stable element that a deleted source row hands focus
// back to, since the row (and its delete button) unmounts on the refresh.
export const AddSourceDialog = forwardRef<HTMLButtonElement, AddSourceDialogProps>(
  function AddSourceDialog({ category, existingFactorIds, disabled, onAdded }, ref) {
    const t = useTranslations("dataEntry.addSource");
    const [open, setOpen] = useState(false);
    const { add, isPending } = useSourceActions();

    if (!category) return null;

    const added = new Set(existingFactorIds);

    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button ref={ref} variant="outline" size="sm" disabled={disabled || isPending}>
            <Plus className="size-4" aria-hidden />
            {t("trigger")}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[min(28rem,calc(100vw-2rem))] p-0">
          <Command filter={accentInsensitiveFilter}>
            <CommandInput placeholder={t("search")} />
            <CommandList>
              <CommandEmpty>{t("empty")}</CommandEmpty>
              {category.subgroups.map((subgroup) => (
                <CommandGroup
                  key={subgroup.subcategory ?? "none"}
                  heading={subgroup.subcategory ?? category.category}
                >
                  {subgroup.options.map((option) => {
                    const isAdded = added.has(option.id);
                    return (
                      <CommandItem
                        key={option.id}
                        value={`${option.element} ${subgroup.subcategory ?? ""}`}
                        disabled={isAdded}
                        onSelect={() => {
                          if (isAdded) return;
                          void add(option.id).then(() => onAdded?.());
                          setOpen(false);
                        }}
                      >
                        <span className="flex-1 truncate">{option.element}</span>
                        {option.biogenic ? (
                          <Badge variant="outline" className="shrink-0">
                            {t("biogenic")}
                          </Badge>
                        ) : null}
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {option.unit}
                        </span>
                        {isAdded ? (
                          <Check className="size-4 shrink-0 text-primary" aria-hidden />
                        ) : null}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    );
  },
);
