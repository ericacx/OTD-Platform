import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import { FormDialog } from "@/components/biz/form-dialog";
import { FormFieldText } from "@/components/form/form-field-text";

import { useSaveReferenceMutation } from "../reference-data.mutations";

import type { NeedleTypeDto, needleTypeUpsertSchema } from "@otd/contracts/masterdata";

type NeedleTypeFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  needleType: NeedleTypeDto | null;
};

export function NeedleTypeFormDialog({ open, onOpenChange, needleType }: NeedleTypeFormDialogProps) {
  const { t } = useTranslation("masterdata");
  const save = useSaveReferenceMutation<NeedleTypeDto, z.input<typeof needleTypeUpsertSchema>>("needleTypes");
  const schema = useMemo(
    () =>
      z.object({
        code: z
          .string()
          .trim()
          .regex(/^\d+N$/, t("NEEDLE_RULE")),
        needles: z.coerce.number().int().min(1),
        description: z.string().trim().max(200),
      }),
    [t],
  );
  const defaults = useMemo(
    () => ({
      code: needleType?.code ?? "",
      needles: needleType?.needles ?? 144,
      description: needleType?.description ?? "",
    }),
    [needleType],
  );

  return (
    <FormDialog
      defaultValues={defaults}
      open={open}
      schema={schema}
      title={needleType ? t("NEEDLE_EDIT") : t("NEEDLE_NEW")}
      onOpenChange={onOpenChange}
      onSubmit={(values) =>
        save.mutateAsync({
          id: needleType?.id,
          input: {
            code: values.code,
            needles: values.needles,
            description: values.description || null,
            ...(needleType ? { version: needleType.version } : {}),
          },
        })
      }
    >
      {(form) => (
        <div className="grid gap-4 sm:grid-cols-2">
          <FormFieldText
            error={form.formState.errors.code?.message}
            label={t("NEEDLE_CODE")}
            name="code"
            register={form.register}
          />
          <FormFieldText
            error={form.formState.errors.needles?.message}
            label={t("NEEDLE_COUNT")}
            name="needles"
            register={form.register}
            type="number"
          />
          <div className="sm:col-span-2">
            <FormFieldText label={t("NEEDLE_DESC")} name="description" register={form.register} />
          </div>
        </div>
      )}
    </FormDialog>
  );
}
