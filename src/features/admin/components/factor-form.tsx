"use client";

import Link from "next/link";
import { Controller } from "react-hook-form";
import { useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { TextField } from "@/components/form/text-field";
import { DecimalField } from "@/components/form/decimal-field";
import { SelectField } from "@/components/form/select-field";
import { useFactorForm } from "../hooks/use-factor-form";
import type { FactorFormValues } from "../schemas/factor-schemas";

const SCOPES = ["SCOPE_1", "SCOPE_2", "SCOPE_3"] as const;
const GWP_SETS = ["AR5", "AR6"] as const;
// Radix Select forbids an empty item value, so "no GWP set" gets a sentinel that maps to "".
const GWP_NONE = "NONE";

type FactorFormProps = {
  mode: "create" | "edit";
  factorId?: string;
  defaultValues: FactorFormValues;
  categories: string[];
  subcategories: string[];
};

function SwitchRow({
  id,
  label,
  help,
  checked,
  onCheckedChange,
}: {
  id: string;
  label: string;
  help: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-md border p-3">
      <div className="space-y-0.5">
        <Label htmlFor={id}>{label}</Label>
        <p className="text-xs text-muted-foreground">{help}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

export function FactorForm({
  mode,
  factorId,
  defaultValues,
  categories,
  subcategories,
}: FactorFormProps) {
  const t = useTranslations("admin.factors");
  const tf = useTranslations("admin.factors.fields");
  const tc = useTranslations("common");
  const { form, onSubmit, isSubmitting, serverError } = useFactorForm({
    mode,
    factorId,
    defaultValues,
  });
  const errors = form.formState.errors;
  const scope = form.watch("scope");

  const scopeOptions = SCOPES.map((value) => ({
    value,
    label: `${tf("scope")} ${value.slice(-1)}`,
  }));
  const gwpOptions = [
    { value: GWP_NONE, label: tf("gwpNone") },
    ...GWP_SETS.map((value) => ({ value, label: value })),
  ];

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("form.identification")}</CardTitle>
          <CardDescription>{t("form.identificationHelp")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <Controller
            control={form.control}
            name="scope"
            render={({ field }) => (
              <SelectField
                id="scope"
                label={tf("scope")}
                options={scopeOptions}
                value={field.value || undefined}
                onValueChange={field.onChange}
                placeholder={tf("scope")}
                error={errors.scope?.message}
              />
            )}
          />
          <TextField label={tf("unit")} {...form.register("unit")} error={errors.unit?.message} />
          <TextField
            label={tf("category")}
            list="factor-categories"
            {...form.register("category")}
            error={errors.category?.message}
          />
          <TextField
            label={tf("subcategory")}
            list="factor-subcategories"
            {...form.register("subcategory")}
            error={errors.subcategory?.message}
          />
          <div className="md:col-span-2">
            <TextField
              label={tf("element")}
              {...form.register("element")}
              error={errors.element?.message}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("form.factorsSection")}</CardTitle>
          <CardDescription>{t("form.factorsHelp")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {scope === "SCOPE_2" ? (
            <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
              {t("form.scope2Note")}
            </p>
          ) : null}
          <div className="grid gap-4 md:grid-cols-2">
            <DecimalField
              label={tf("co2Factor")}
              {...form.register("co2Factor")}
              error={errors.co2Factor?.message}
            />
            <DecimalField
              label={tf("ch4Factor")}
              {...form.register("ch4Factor")}
              error={errors.ch4Factor?.message}
            />
            <DecimalField
              label={tf("n2oFactor")}
              {...form.register("n2oFactor")}
              error={errors.n2oFactor?.message}
            />
            <DecimalField
              label={tf("co2eFactor")}
              {...form.register("co2eFactor")}
              error={errors.co2eFactor?.message}
            />
            <DecimalField
              label={tf("co2eFactorCop")}
              {...form.register("co2eFactorCop")}
              error={errors.co2eFactorCop?.message}
            />
            <DecimalField
              label={tf("co2eFactorUsd")}
              {...form.register("co2eFactorUsd")}
              error={errors.co2eFactorUsd?.message}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("form.metadata")}</CardTitle>
          <CardDescription>{t("form.metadataHelp")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <TextField
            label={tf("factorUnit")}
            {...form.register("factorUnit")}
            error={errors.factorUnit?.message}
          />
          <Controller
            control={form.control}
            name="gwpSet"
            render={({ field }) => (
              <SelectField
                id="gwpSet"
                label={tf("gwpSet")}
                options={gwpOptions}
                value={field.value === "" ? GWP_NONE : field.value}
                onValueChange={(value) =>
                  field.onChange(value === GWP_NONE ? "" : value)
                }
                error={errors.gwpSet?.message}
              />
            )}
          />
          <DecimalField
            label={tf("uncertaintyPct")}
            unit="%"
            {...form.register("uncertaintyPct")}
            error={errors.uncertaintyPct?.message}
          />
          <TextField
            label={tf("effectiveYear")}
            type="number"
            inputMode="numeric"
            {...form.register("effectiveYear")}
            error={errors.effectiveYear?.message}
          />
          <div className="grid gap-2 md:col-span-2">
            <Label htmlFor="source">{tf("source")}</Label>
            <Textarea
              id="source"
              {...form.register("source")}
              aria-invalid={errors.source ? true : undefined}
            />
            {errors.source ? (
              <p className="text-sm text-destructive">{errors.source.message}</p>
            ) : null}
          </div>
          <Controller
            control={form.control}
            name="biogenic"
            render={({ field }) => (
              <SwitchRow
                id="biogenic"
                label={tf("biogenic")}
                help={tf("biogenicHelp")}
                checked={field.value}
                onCheckedChange={field.onChange}
              />
            )}
          />
          <Controller
            control={form.control}
            name="active"
            render={({ field }) => (
              <SwitchRow
                id="active"
                label={tf("active")}
                help={tf("activeHelp")}
                checked={field.value}
                onCheckedChange={field.onChange}
              />
            )}
          />
        </CardContent>
      </Card>

      {serverError ? <p className="text-sm text-destructive">{serverError}</p> : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" loading={isSubmitting}>
          {tc("save")}
        </Button>
        <Button asChild variant="ghost">
          <Link href="/admin/factors">
            <ArrowLeft className="size-4" aria-hidden />
            {t("backToLibrary")}
          </Link>
        </Button>
      </div>

      <datalist id="factor-categories">
        {categories.map((value) => (
          <option key={value} value={value} />
        ))}
      </datalist>
      <datalist id="factor-subcategories">
        {subcategories.map((value) => (
          <option key={value} value={value} />
        ))}
      </datalist>
    </form>
  );
}
