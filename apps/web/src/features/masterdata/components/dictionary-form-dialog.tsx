import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import { FormDialog } from "@/components/biz/form-dialog";
import { FormFieldText } from "@/components/form/form-field-text";
import { Switch } from "@/components/ui/switch";

import { useSaveReferenceMutation } from "../reference-data.mutations";

import type { DictionaryDto, dictionaryUpsertSchema } from "@otd/contracts/masterdata";

type DictionaryFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: DictionaryDto | null;
  defaultType?: string | undefined;
};

export function DictionaryFormDialog({ open, onOpenChange, entry, defaultType }: DictionaryFormDialogProps) {
  const { t } = useTranslation("masterdata");
  const save = useSaveReferenceMutation<DictionaryDto, z.input<typeof dictionaryUpsertSchema>>("dictionaries");
  const schema = useMemo(
    () =>
      z.object({
        type: z.string().trim().min(1).max(40),
        code: z.string().trim().min(1).max(40),
        labelZh: z.string().trim().min(1).max(60),
        labelEn: z.string().trim().min(1).max(120),
        sort: z.coerce.number().int(),
        enabled: z.boolean(),
      }),
    [],
  );
  const defaults = useMemo(
    () => ({
      type: entry?.type ?? defaultType ?? "",
      code: entry?.code ?? "",
      labelZh: entry?.label.zh ?? "",
      labelEn: entry?.label.en ?? "",
      sort: entry?.sort ?? 0,
      enabled: entry?.enabled ?? true,
    }),
    [entry, defaultType],
  );

  return (
    <FormDialog
      defaultValues={defaults}
      open={open}
      schema={schema}
      title={entry ? t("DICT_EDIT") : t("DICT_NEW")}
      onOpenChange={onOpenChange}
      onSubmit={(values) =>
        save.mutateAsync({
          id: entry?.id,
          input: {
            type: values.type,
            code: values.code,
            label: { zh: values.labelZh, en: values.labelEn },
            sort: values.sort,
            enabled: values.enabled,
            ...(entry ? { version: entry.version } : {}),
          },
        })
      }
    >
      {(form) => (
        <div className="grid gap-4 sm:grid-cols-2">
          <FormFieldText
            error={form.formState.errors.type?.message}
            label={t("DICT_TYPE")}
            name="type"
            register={form.register}
          />
          <FormFieldText
            error={form.formState.errors.code?.message}
            label={t("COL_CODE")}
            name="code"
            register={form.register}
          />
          <FormFieldText
            error={form.formState.errors.labelZh?.message}
            label={t("DICT_LABEL_ZH")}
            name="labelZh"
            register={form.register}
          />
          <FormFieldText
            error={form.formState.errors.labelEn?.message}
            label={t("DICT_LABEL_EN")}
            name="labelEn"
            register={form.register}
          />
          <FormFieldText label={t("DICT_SORT")} name="sort" register={form.register} type="number" />
          <label className="flex items-center gap-3 self-end pb-2 text-sm">
            <Switch checked={form.watch("enabled")} onCheckedChange={(v) => form.setValue("enabled", v)} />
            {t("ACTIVE")}
          </label>
        </div>
      )}
    </FormDialog>
  );
}
