import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import { FormDialog } from "@/components/biz/form-dialog";
import { FormFieldSelect } from "@/components/form/form-field-select";
import { FormFieldText } from "@/components/form/form-field-text";

import { useSaveReferenceMutation } from "../reference-data.mutations";

import type { MaterialDto, materialUpsertSchema } from "@otd/contracts/masterdata";

export const MATERIAL_CATEGORIES = ["YARN", "TRIM", "PACKAGING"] as const;
const CURRENCIES = ["CNY", "USD", "EUR", "JPY", "GBP", "HKD"];

type MaterialFormDialogProps = { open: boolean; onOpenChange: (open: boolean) => void; material: MaterialDto | null };

export function MaterialFormDialog({ open, onOpenChange, material }: MaterialFormDialogProps) {
  const { t } = useTranslation("masterdata");
  const save = useSaveReferenceMutation<MaterialDto, z.input<typeof materialUpsertSchema>>("materials");
  const schema = useMemo(
    () =>
      z.object({
        code: z.string().trim().min(1).max(40),
        name: z.string().trim().min(1).max(80),
        category: z.enum(MATERIAL_CATEGORIES),
        spec: z.string().trim().max(80),
        unit: z.string().trim().min(1).max(10),
        unitPrice: z.string().trim(),
        currency: z.string().length(3),
        supplier: z.string().trim().max(80),
      }),
    [],
  );
  const defaults = useMemo(
    () => ({
      code: material?.code ?? "",
      name: material?.name ?? "",
      category: material?.category ?? "YARN",
      spec: material?.spec ?? "",
      unit: material?.unit ?? "kg",
      unitPrice: material?.unitPrice === null || material?.unitPrice === undefined ? "" : String(material.unitPrice),
      currency: material?.currency ?? "CNY",
      supplier: material?.supplier ?? "",
    }),
    [material],
  );
  const categoryLabel = (c: (typeof MATERIAL_CATEGORIES)[number]) =>
    c === "YARN" ? t("CAT_YARN") : c === "TRIM" ? t("CAT_TRIM") : t("CAT_PACKAGING");

  return (
    <FormDialog
      defaultValues={defaults}
      open={open}
      schema={schema}
      title={material ? t("MATERIAL_EDIT") : t("MATERIAL_NEW")}
      width="md"
      onOpenChange={onOpenChange}
      onSubmit={(values) =>
        save.mutateAsync({
          id: material?.id,
          input: {
            code: values.code,
            name: values.name,
            category: values.category,
            spec: values.spec || null,
            unit: values.unit,
            unitPrice: values.unitPrice === "" ? null : Number(values.unitPrice),
            currency: values.currency,
            supplier: values.supplier || null,
            ...(material ? { version: material.version } : {}),
          },
        })
      }
    >
      {(form) => (
        <div className="grid gap-4 sm:grid-cols-2">
          <FormFieldText
            error={form.formState.errors.code?.message}
            label={t("COL_CODE")}
            name="code"
            register={form.register}
          />
          <FormFieldText
            error={form.formState.errors.name?.message}
            label={t("COL_NAME")}
            name="name"
            register={form.register}
          />
          <FormFieldSelect
            label={t("MATERIAL_CATEGORY")}
            name="category"
            options={MATERIAL_CATEGORIES.map((c) => ({ value: c, label: categoryLabel(c) }))}
            register={form.register}
          />
          <FormFieldText label={t("MATERIAL_SPEC")} name="spec" register={form.register} />
          <FormFieldText
            error={form.formState.errors.unit?.message}
            label={t("MATERIAL_UNIT")}
            name="unit"
            register={form.register}
          />
          <FormFieldText
            label={t("MATERIAL_PRICE")}
            name="unitPrice"
            register={form.register}
            step="0.0001"
            type="number"
          />
          <FormFieldSelect
            label={t("CURRENCY")}
            name="currency"
            options={CURRENCIES.map((c) => ({ value: c, label: c }))}
            register={form.register}
          />
          <FormFieldText label={t("MATERIAL_SUPPLIER")} name="supplier" register={form.register} />
        </div>
      )}
    </FormDialog>
  );
}
