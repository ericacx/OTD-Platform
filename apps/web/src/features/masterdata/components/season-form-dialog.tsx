import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import { FormDialog } from "@/components/biz/form-dialog";
import { FormFieldDate } from "@/components/form/form-field-date";
import { FormFieldText } from "@/components/form/form-field-text";

import { useSaveReferenceMutation } from "../reference-data.mutations";

import type { SeasonDto, seasonUpsertSchema } from "@otd/contracts/masterdata";

type SeasonFormDialogProps = { open: boolean; onOpenChange: (open: boolean) => void; season: SeasonDto | null };

export function SeasonFormDialog({ open, onOpenChange, season }: SeasonFormDialogProps) {
  const { t } = useTranslation("masterdata");
  const save = useSaveReferenceMutation<SeasonDto, z.input<typeof seasonUpsertSchema>>("seasons");
  const schema = useMemo(
    () =>
      z.object({
        code: z
          .string()
          .trim()
          .regex(/^(SS|SP|SU|FA|AW|HO)\d{2}$/, t("SEASON_CODE_RULE")),
        labelZh: z.string().trim().min(1).max(40),
        labelEn: z.string().trim().min(1).max(80),
        startDate: z.union([z.literal(""), z.iso.date()]),
        endDate: z.union([z.literal(""), z.iso.date()]),
      }),
    [t],
  );
  const defaults = useMemo(
    () => ({
      code: season?.code ?? "",
      labelZh: season?.label.zh ?? "",
      labelEn: season?.label.en ?? "",
      startDate: season?.startDate ?? "",
      endDate: season?.endDate ?? "",
    }),
    [season],
  );

  return (
    <FormDialog
      defaultValues={defaults}
      open={open}
      schema={schema}
      title={season ? t("SEASON_EDIT") : t("SEASON_NEW")}
      onOpenChange={onOpenChange}
      onSubmit={(values) =>
        save.mutateAsync({
          id: season?.code,
          input: {
            code: season?.code ?? values.code,
            label: { zh: values.labelZh, en: values.labelEn },
            startDate: values.startDate || null,
            endDate: values.endDate || null,
            ...(season ? { version: season.version } : {}),
          },
        })
      }
    >
      {(form) => (
        <div className="grid gap-4 sm:grid-cols-2">
          {season ? (
            <div className="space-y-1.5">
              <p className="text-sm font-medium">{t("SEASON_CODE")}</p>
              <p className="tabular flex h-9 items-center rounded-md bg-muted px-3 text-sm text-muted-foreground">
                {season.code}
              </p>
            </div>
          ) : (
            <FormFieldText
              error={form.formState.errors.code?.message}
              label={t("SEASON_CODE")}
              name="code"
              register={form.register}
            />
          )}
          <div aria-hidden="true" />
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
          <FormFieldDate label={t("SEASON_START")} name="startDate" register={form.register} />
          <FormFieldDate label={t("SEASON_END")} name="endDate" register={form.register} />
        </div>
      )}
    </FormDialog>
  );
}
