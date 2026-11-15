import { INSPECTION_STAGES } from "@otd/contracts/inspection";
import { useMemo } from "react";
import { Controller } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import { FormDialog } from "@/components/biz/form-dialog";
import { FormFieldDate } from "@/components/form/form-field-date";
import { FormFieldSelect } from "@/components/form/form-field-select";
import { FormFieldText } from "@/components/form/form-field-text";
import { FormFieldTextarea } from "@/components/form/form-field-textarea";

import { stageLabel } from "../inspection.labels";
import { useCreateInspectionMutation } from "../inspection.mutations";

import { OrderPicker, StylePicker } from "./order-picker";

import type { InspectionDto } from "@otd/contracts/inspection";

type Props = { open: boolean; onOpenChange: (open: boolean) => void; onCreated?: (row: InspectionDto) => void };

export function InspectionCreateDialog({ open, onOpenChange, onCreated }: Props) {
  const { t, i18n } = useTranslation("inspection");
  const create = useCreateInspectionMutation();
  const schema = useMemo(
    () =>
      z.object({
        orderId: z.string().min(1, t("ORDER_REQUIRED")),
        styleId: z.string(),
        stage: z.enum(INSPECTION_STAGES),
        plannedDate: z.string(),
        method: z.string().max(60),
        channel: z.string().max(60),
        inspector: z.string().max(60),
        requirements: z.string().max(1000),
      }),
    [t],
  );
  return (
    <FormDialog
      defaultValues={{
        orderId: "",
        styleId: "",
        stage: "FRI" as const,
        plannedDate: "",
        method: "",
        channel: "",
        inspector: "",
        requirements: "",
      }}
      open={open}
      schema={schema}
      title={t("CREATE_TITLE")}
      width="md"
      onOpenChange={onOpenChange}
      onSubmit={async (values) => {
        const row = await create.mutateAsync({
          orderId: values.orderId,
          styleId: values.styleId || null,
          stage: values.stage,
          plannedDate: values.plannedDate || null,
          method: values.method || null,
          channel: values.channel || null,
          inspector: values.inspector || null,
          requirements: values.requirements || null,
        });
        onCreated?.(row);
      }}
    >
      {(form) => (
        <div className="grid gap-4 sm:grid-cols-2">
          <Controller
            control={form.control}
            name="orderId"
            render={({ field, fieldState }) => (
              <OrderPicker
                error={fieldState.error?.message}
                value={field.value}
                onChange={(id) => {
                  field.onChange(id);
                  form.setValue("styleId", "");
                }}
              />
            )}
          />
          <Controller
            control={form.control}
            name="styleId"
            render={({ field }) => (
              <StylePicker orderId={form.watch("orderId")} value={field.value} onChange={field.onChange} />
            )}
          />
          <FormFieldSelect
            label={t("STAGE")}
            name="stage"
            options={INSPECTION_STAGES.map((s) => ({ value: s, label: stageLabel(s, i18n.language) }))}
            register={form.register}
          />
          <FormFieldDate label={t("PLANNED_DATE")} name="plannedDate" register={form.register} />
          <FormFieldText label={t("METHOD")} name="method" placeholder={t("METHOD_HINT")} register={form.register} />
          <FormFieldText label={t("CHANNEL")} name="channel" placeholder={t("CHANNEL_HINT")} register={form.register} />
          <FormFieldText label={t("INSPECTOR")} name="inspector" register={form.register} />
          <div className="sm:col-span-2">
            <FormFieldTextarea label={t("REQUIREMENTS")} name="requirements" register={form.register} rows={3} />
          </div>
        </div>
      )}
    </FormDialog>
  );
}
