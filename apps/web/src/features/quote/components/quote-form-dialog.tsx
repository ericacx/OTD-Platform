import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import { FormDialog } from "@/components/biz/form-dialog";
import { FormFieldDate } from "@/components/form/form-field-date";
import { FormFieldSelect } from "@/components/form/form-field-select";
import { FormFieldText } from "@/components/form/form-field-text";
import { FormFieldTextarea } from "@/components/form/form-field-textarea";
import { useLookups } from "@/features/masterdata/lookups.queries";

import { useCreateQuoteMutation, useUpdateQuoteMutation } from "../quote.mutations";
import { useStrategiesQuery, useStyleOptionsQuery } from "../quote.queries";

import type { QuoteDto } from "../quote.types";

type QuoteFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quote: QuoteDto | null;
  onSaved?: (quote: QuoteDto) => void;
};

const DECIMAL = /^(\d+(\.\d+)?)?$/;

function num(value: string): number | null {
  return value.trim() === "" ? null : Number(value);
}

export function QuoteFormDialog({ open, onOpenChange, quote, onSaved }: QuoteFormDialogProps) {
  const { t } = useTranslation("quote");
  const { t: tc } = useTranslation();
  const strategies = useStrategiesQuery(open);
  const styles = useStyleOptionsQuery({}, open && !quote);
  const lookups = useLookups();
  const create = useCreateQuoteMutation();
  const update = useUpdateQuoteMutation();

  const schema = useMemo(
    () =>
      z.object({
        styleId: z.string().min(1, tc("FRMREQ")),
        strategyId: z.string().min(1, tc("FRMREQ")),
        factoryId: z.string(),
        moq: z.string().regex(/^\d*$/, tc("FRMINV")),
        targetPriceUsd: z.string().regex(DECIMAL, tc("FRMINV")),
        targetFx: z.string().regex(DECIMAL, tc("FRMINV")),
        targetSource: z.string().max(60),
        targetDate: z.string(),
        note: z.string().max(500),
      }),
    [tc],
  );

  const styleOptions = quote
    ? [{ value: quote.styleId, label: `#${quote.styleNo} · ${quote.styleName}` }]
    : [
        { value: "", label: t("STYLE_PICK") },
        ...(styles.data ?? [])
          .filter((s) => !s.quoteId)
          .map((s) => ({ value: s.id, label: `#${s.styleNo} · ${s.nameZh} · ${s.customerName}` })),
      ];

  const defaults = useMemo(
    () => ({
      styleId: quote?.styleId ?? "",
      strategyId: quote?.strategy?.id ?? "",
      factoryId: quote?.factoryId ?? "",
      moq: quote?.moq != null ? String(quote.moq) : "",
      targetPriceUsd: quote?.targetPriceUsd != null ? String(quote.targetPriceUsd) : "",
      targetFx: quote?.targetFx != null ? String(quote.targetFx) : "",
      targetSource: quote?.targetSource ?? "",
      targetDate: quote?.targetDate ?? "",
      note: quote?.note ?? "",
    }),
    [quote],
  );

  return (
    <FormDialog
      defaultValues={defaults}
      open={open}
      schema={schema}
      title={quote ? t("QUOTE_EDIT") : t("QUOTE_NEW")}
      width="md"
      onOpenChange={onOpenChange}
      onSubmit={async (values) => {
        const header = {
          strategyId: values.strategyId,
          factoryId: values.factoryId || null,
          moq: num(values.moq),
          targetPriceUsd: num(values.targetPriceUsd),
          targetFx: num(values.targetFx),
          targetSource: values.targetSource.trim() || null,
          targetDate: values.targetDate || null,
          note: values.note.trim() || null,
        };
        const saved = quote
          ? await update.mutateAsync({ id: quote.id, input: { ...header, version: quote.version } })
          : await create.mutateAsync({ ...header, styleId: values.styleId });
        onSaved?.(saved);
      }}
    >
      {(form) => (
        <div className="grid gap-4 sm:grid-cols-2">
          <FormFieldSelect
            disabled={Boolean(quote)}
            error={form.formState.errors.styleId?.message}
            label={t("STYLE")}
            name="styleId"
            options={styleOptions}
            register={form.register}
          />
          <FormFieldSelect
            error={form.formState.errors.strategyId?.message}
            label={t("STRATEGY")}
            name="strategyId"
            options={[
              { value: "", label: t("STRATEGY_PICK") },
              ...(strategies.data ?? [])
                .filter((s) => s.enabled)
                .map((s) => ({ value: s.id, label: `${s.code} · ${s.name}` })),
            ]}
            register={form.register}
          />
          <FormFieldSelect
            label={t("FACTORY")}
            name="factoryId"
            options={[
              { value: "", label: "—" },
              ...(lookups.data?.factories ?? []).map((f) => ({ value: f.id, label: f.name })),
            ]}
            register={form.register}
          />
          <FormFieldText
            error={form.formState.errors.moq?.message}
            label={t("MOQ")}
            name="moq"
            register={form.register}
          />
          <FormFieldText
            error={form.formState.errors.targetPriceUsd?.message}
            label={t("TARGET_PRICE_USD")}
            name="targetPriceUsd"
            register={form.register}
          />
          <FormFieldText
            error={form.formState.errors.targetFx?.message}
            label={t("TARGET_FX")}
            name="targetFx"
            register={form.register}
          />
          <FormFieldText label={t("TARGET_SOURCE")} name="targetSource" register={form.register} />
          <FormFieldDate label={t("TARGET_DATE")} name="targetDate" register={form.register} />
          <div className="sm:col-span-2">
            <FormFieldTextarea label={t("NOTE")} name="note" register={form.register} />
          </div>
        </div>
      )}
    </FormDialog>
  );
}
