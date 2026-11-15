import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import { FormDialog } from "@/components/biz/form-dialog";
import { FormFieldDate } from "@/components/form/form-field-date";
import { FormFieldSelect } from "@/components/form/form-field-select";
import { FormFieldText } from "@/components/form/form-field-text";

import { useSaveReferenceMutation } from "../reference-data.mutations";

import type { ExchangeRateDto, exchangeRateWriteSchema } from "@otd/contracts/masterdata";

type RateFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rate: ExchangeRateDto | null;
  currencies: string[];
};

export function RateFormDialog({ open, onOpenChange, rate, currencies }: RateFormDialogProps) {
  const { t } = useTranslation("masterdata");
  const save = useSaveReferenceMutation<ExchangeRateDto, z.input<typeof exchangeRateWriteSchema>>("exchangeRates");
  const schema = useMemo(
    () =>
      z.object({
        currency: z.string().length(3),
        rateToCny: z.coerce.number().positive(),
        effectiveDate: z.iso.date(),
      }),
    [],
  );
  const defaults = useMemo(
    () => ({
      currency: rate?.currency ?? currencies[0] ?? "USD",
      rateToCny: rate?.rateToCny ?? 1,
      effectiveDate: rate?.effectiveDate ?? "",
    }),
    [rate, currencies],
  );
  const options = rate && !currencies.includes(rate.currency) ? [...currencies, rate.currency] : currencies;

  return (
    <FormDialog
      defaultValues={defaults}
      open={open}
      schema={schema}
      title={rate ? t("RATE_EDIT") : t("RATE_NEW")}
      onOpenChange={onOpenChange}
      onSubmit={(values) =>
        save.mutateAsync({
          id: rate?.id,
          input: {
            currency: values.currency,
            rateToCny: values.rateToCny,
            effectiveDate: values.effectiveDate,
            ...(rate ? { version: rate.version } : {}),
          },
        })
      }
    >
      {(form) => (
        <div className="grid gap-4 sm:grid-cols-3">
          <FormFieldSelect
            label={t("RATE_CURRENCY")}
            name="currency"
            options={options.map((c) => ({ value: c, label: c }))}
            register={form.register}
          />
          <FormFieldText
            error={form.formState.errors.rateToCny?.message}
            label={t("RATE_TO_CNY")}
            name="rateToCny"
            register={form.register}
            step="0.0001"
            type="number"
          />
          <FormFieldDate
            error={form.formState.errors.effectiveDate?.message}
            label={t("RATE_DATE")}
            name="effectiveDate"
            register={form.register}
          />
        </div>
      )}
    </FormDialog>
  );
}
