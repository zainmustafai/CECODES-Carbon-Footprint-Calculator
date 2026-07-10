"use client";

import { useState } from "react";
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
};

// Element names come from the factor library, so a company cannot invent or misspell one.
// Already-added elements stay visible but unselectable, which is clearer than hiding them.
export function AddSourceDialog({
  category,
  existingFactorIds,
  disabled,
}: AddSourceDialogProps) {
  const t = useTranslations("dataEntry.addSource");
  const [open, setOpen] = useState(false);
  const { add, isPending } = useSourceActions();

  if (!category) return null;

  const added = new Set(existingFactorIds);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled || isPending}>
          <Plus className="size-4" aria-hidden />
          {t("trigger")}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(28rem,calc(100vw-2rem))] p-0">
        <Command>
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
                        add(option.id);
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
}
