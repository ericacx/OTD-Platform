import { Plus, Trash2 } from "lucide-react";
import { useMemo } from "react";
import { useFieldArray, type UseFormReturn } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import { FormDialog } from "@/components/biz/form-dialog";
import { FormFieldSelect } from "@/components/form/form-field-select";
import { FormFieldText } from "@/components/form/form-field-text";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { useSaveStrategyMutation } from "../quote.mutations";

import type { QuoteStrategyDto } from "../quote.types";

const DECIMAL = /^-?\d+(\.\d+)?$/;
const PERCENT_FIELDS = [
  "lossRate",
  "overheadRate",
  "markupRate",
  "targetMargin",
  "guardrail",
  "smallOrderUplift",
] as const;

type StrategyFormValues = {
  name: string;
  nameEn: string;
  method: "MARKUP" | "MARGIN";
  lossRate: string;
  overheadRate: string;
  markupRate: string;
  targetMargin: string;
  guardrail: string;
  lockedFx: string;
  moq: string;
  smallOrderUplift: string;
  enabled: "true" | "false";
  reason: string;
  tiers: { minWan: string; discount: string }[];
};

function percentText(rate: number): string {
  return String(Math.round(rate * 10000) / 100);
}

function TiersEditor({ form }: { form: UseFormReturn<StrategyFormValues> }) {
  const { t } = useTranslation("quote");
  const { t: tc } = useTranslation();
  const tiers = useFieldArray({ control: form.control, name: "tiers" });
  return (
    <fieldset className="space-y-2 sm:col-span-2">
      <legend className="text-sm font-medium">{t("SKU_TIERS")}</legend>
      {tiers.fields.map((field, index) => (
        <div className="flex items-center gap-2" key={field.id}>
          <span className="text-sm text-muted-foreground">≥</span>
          <Input
            aria-label={t("TIER_MIN", { index: index + 1 })}
            className="tabular h-8 w-28"
            {...form.register(`tiers.${index}.minWan`)}
          />
          <span className="text-sm text-muted-foreground">{t("UNIT_WAN")}</span>
          <span className="text-sm text-muted-foreground">-</span>
          <Input
            aria-label={t("TIER_DISCOUNT", { index: index + 1 })}
            className="tabular h-8 w-20"
            {...form.register(`tiers.${index}.discount`)}
          />
          <span className="text-sm text-muted-foreground">%</span>
          <Button
            aria-label={tc("jAiN8T")}
            size="icon"
            type="button"
            variant="ghost"
            onClick={() => tiers.remove(index)}
          >
            <Trash2 aria-hidden="true" className="size-4" />
          </Button>
        </div>
      ))}
      <Button size="sm" type="button" variant="outline" onClick={() => tiers.append({ minWan: "", discount: "" })}>
        <Plus aria-hidden="true" className="size-4" />
        {t("TIER_ADD")}
      </Button>
    </fieldset>
  );
}

type StrategyFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  strategy: QuoteStrategyDto | null;
};

export function StrategyFormDialog({ open, onOpenChange, strategy }: StrategyFormDialogProps) {
  const { t } = useTranslation("quote");
  const { t: tc } = useTranslation();
  const save = useSaveStrategyMutation();
  const schema = useMemo(() => {
    const decimal = z.string().regex(DECIMAL, tc("FRMINV"));
    return z.object({
      name: z.string().trim().min(1, tc("FRMREQ")).max(60),
      nameEn: z.string().max(120),
      method: z.enum(["MARKUP", "MARGIN"]),
      lossRate: decimal,
      overheadRate: decimal,
      markupRate: decimal,
      targetMargin: decimal,
      guardrail: decimal,
      lockedFx: decimal,
      moq: z.string().regex(/^\d+$/, tc("FRMINV")),
      smallOrderUplift: decimal,
      enabled: z.enum(["true", "false"]),
      reason: z.string().max(200),
      tiers: z.array(z.object({ minWan: decimal, discount: decimal })),
    });
  }, [tc]);

  const defaults = useMemo<StrategyFormValues>(
    () => ({
      name: strategy?.name ?? "",
      nameEn: strategy?.nameEn ?? "",
      method: strategy?.method ?? "MARKUP",
      lossRate: percentText(strategy?.lossRate ?? 0.2),
      overheadRate: percentText(strategy?.overheadRate ?? 0),
      markupRate: percentText(strategy?.markupRate ?? 0.2),
      targetMargin: percentText(strategy?.targetMargin ?? 0.18),
      guardrail: percentText(strategy?.guardrail ?? 0.12),
      lockedFx: String(strategy?.lockedFx ?? 6.72),
      moq: String(strategy?.moq ?? 0),
      smallOrderUplift: percentText(strategy?.smallOrderUplift ?? 0),
      enabled: strategy?.enabled === false ? "false" : "true",
      reason: "",
      tiers: (strategy?.skuTiers ?? []).map((tier) => ({
        minWan: String(tier.minAmount / 10_000),
        discount: percentText(tier.discount),
      })),
    }),
    [strategy],
  );

  return (
    <FormDialog
      defaultValues={defaults}
      {...(strategy ? { description: t("STRATEGY_EDIT_HINT", { version: strategy.version }) } : {})}
      open={open}
      schema={schema}
      title={strategy ? t("STRATEGY_EDIT", { code: strategy.code }) : t("STRATEGY_NEW")}
      width="md"
      onOpenChange={onOpenChange}
      onSubmit={(values) => {
        const rate = (key: (typeof PERCENT_FIELDS)[number]) => Number(values[key]) / 100;
        return save.mutateAsync({
          ...(strategy ? { id: strategy.id } : {}),
          input: {
            name: values.name.trim(),
            nameEn: values.nameEn.trim() || null,
            method: values.method,
            lossRate: rate("lossRate"),
            overheadRate: rate("overheadRate"),
            markupRate: rate("markupRate"),
            targetMargin: rate("targetMargin"),
            guardrail: rate("guardrail"),
            smallOrderUplift: rate("smallOrderUplift"),
            lockedFx: Number(values.lockedFx),
            moq: Number(values.moq),
            enabled: values.enabled === "true",
            skuTiers: values.tiers.map((tier) => ({
              minAmount: Number(tier.minWan) * 10_000,
              discount: Number(tier.discount) / 100,
            })),
            ...(values.reason.trim() ? { reason: values.reason.trim() } : {}),
            ...(strategy ? { version: strategy.version } : {}),
          },
        });
      }}
    >
      {(form) => (
        <div className="grid gap-4 sm:grid-cols-2">
          <FormFieldText
            error={form.formState.errors.name?.message}
            label={t("STRATEGY_NAME")}
            name="name"
            register={form.register}
          />
          <FormFieldText label={t("NAME_EN")} name="nameEn" register={form.register} />
          <FormFieldSelect
            label={t("METHOD")}
            name="method"
            options={[
              { value: "MARKUP", label: t("METHOD_MARKUP") },
              { value: "MARGIN", label: t("METHOD_MARGIN") },
            ]}
            register={form.register}
          />
          <FormFieldSelect
            label={t("STATUS")}
            name="enabled"
            options={[
              { value: "true", label: tc("6B0AKM") },
              { value: "false", label: tc("STINACT") },
            ]}
            register={form.register}
          />
          {PERCENT_FIELDS.map((key) => (
            <FormFieldText
              error={form.formState.errors[key]?.message}
              key={key}
              label={`${t(`FIELD_${key}`)} (%)`}
              name={key}
              register={form.register}
            />
          ))}
          <FormFieldText
            error={form.formState.errors.lockedFx?.message}
            label={t("LOCKED_FX")}
            name="lockedFx"
            register={form.register}
          />
          <FormFieldText
            error={form.formState.errors.moq?.message}
            label={t("STRATEGY_MOQ")}
            name="moq"
            register={form.register}
          />
          <TiersEditor form={form} />
          {strategy ? (
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="strategy-reason">{t("CHANGE_REASON")}</Label>
              <Input id="strategy-reason" {...form.register("reason")} />
            </div>
          ) : null}
        </div>
      )}
    </FormDialog>
  );
}
