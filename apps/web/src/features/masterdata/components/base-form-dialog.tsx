import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import { FormDialog } from "@/components/biz/form-dialog";
import { FormFieldSelect } from "@/components/form/form-field-select";
import { FormFieldText } from "@/components/form/form-field-text";

import { useSaveReferenceMutation } from "../reference-data.mutations";

import type { BaseDetailDto, baseUpsertSchema } from "@otd/contracts/masterdata";

const COUNTRIES = ["CN", "VN", "KH", "BD", "ID", "TH", "MM", "PK", "TR"];

type BaseFormDialogProps = { open: boolean; onOpenChange: (open: boolean) => void; base: BaseDetailDto | null };

export function BaseFormDialog({ open, onOpenChange, base }: BaseFormDialogProps) {
  const { t } = useTranslation("masterdata");
  const save = useSaveReferenceMutation<BaseDetailDto, z.input<typeof baseUpsertSchema>>("bases");
  const schema = useMemo(
    () =>
      z.object({
        code: z.string().trim().min(1).max(10),
        name: z.string().trim().min(1).max(60),
        nameEn: z.string().trim().max(120),
        country: z.string().length(2),
      }),
    [],
  );
  const defaults = useMemo(
    () => ({
      code: base?.code ?? "",
      name: base?.name ?? "",
      nameEn: base?.nameEn ?? "",
      country: base?.country ?? "CN",
    }),
    [base],
  );
  const countries = base && !COUNTRIES.includes(base.country) ? [...COUNTRIES, base.country] : COUNTRIES;

  return (
    <FormDialog
      defaultValues={defaults}
      open={open}
      schema={schema}
      title={base ? t("BASE_EDIT") : t("BASE_NEW")}
      onOpenChange={onOpenChange}
      onSubmit={(values) =>
        save.mutateAsync({
          id: base?.id,
          input: {
            code: values.code,
            name: values.name,
            nameEn: values.nameEn || null,
            country: values.country,
            ...(base ? { version: base.version } : {}),
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
          <FormFieldText label={t("COL_NAME_EN")} name="nameEn" register={form.register} />
          <FormFieldSelect
            label={t("BASE_COUNTRY")}
            name="country"
            options={countries.map((c) => ({ value: c, label: c }))}
            register={form.register}
          />
        </div>
      )}
    </FormDialog>
  );
}
