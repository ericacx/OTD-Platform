import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import { FormDialog } from "@/components/biz/form-dialog";
import { FormFieldSelect } from "@/components/form/form-field-select";
import { FormFieldText } from "@/components/form/form-field-text";

import { useSaveReferenceMutation } from "../reference-data.mutations";

import type { BaseDetailDto, FactoryDto, factoryUpsertSchema } from "@otd/contracts/masterdata";

type FactoryFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  factory: FactoryDto | null;
  bases: BaseDetailDto[];
  defaultBaseId?: string | undefined;
};

export function FactoryFormDialog({ open, onOpenChange, factory, bases, defaultBaseId }: FactoryFormDialogProps) {
  const { t } = useTranslation("masterdata");
  const save = useSaveReferenceMutation<FactoryDto, z.input<typeof factoryUpsertSchema>>("factories");
  const schema = useMemo(
    () =>
      z.object({
        code: z.string().trim().min(1).max(20),
        name: z.string().trim().min(1).max(60),
        nameEn: z.string().trim().max(120),
        baseId: z.string().min(1, t("FIELD_REQUIRED")),
        legalEntity: z.string().trim().max(120),
      }),
    [t],
  );
  const defaults = useMemo(
    () => ({
      code: factory?.code ?? "",
      name: factory?.name ?? "",
      nameEn: factory?.nameEn ?? "",
      baseId: factory?.baseId ?? defaultBaseId ?? bases[0]?.id ?? "",
      legalEntity: factory?.legalEntity ?? "",
    }),
    [factory, defaultBaseId, bases],
  );

  return (
    <FormDialog
      defaultValues={defaults}
      open={open}
      schema={schema}
      title={factory ? t("FACTORY_EDIT") : t("FACTORY_NEW")}
      onOpenChange={onOpenChange}
      onSubmit={(values) =>
        save.mutateAsync({
          id: factory?.id,
          input: {
            code: values.code,
            name: values.name,
            nameEn: values.nameEn || null,
            baseId: values.baseId,
            legalEntity: values.legalEntity || null,
            ...(factory ? { version: factory.version } : {}),
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
            error={form.formState.errors.baseId?.message}
            label={t("FACTORY_BASE")}
            name="baseId"
            options={bases.map((b) => ({ value: b.id, label: `${b.code} · ${b.name}` }))}
            register={form.register}
          />
          <div className="sm:col-span-2">
            <FormFieldText label={t("FACTORY_LEGAL")} name="legalEntity" register={form.register} />
          </div>
        </div>
      )}
    </FormDialog>
  );
}
