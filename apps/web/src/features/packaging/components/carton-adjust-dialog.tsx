import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import { FormDialog } from "@/components/biz/form-dialog";
import { FormFieldDate } from "@/components/form/form-field-date";
import { FormFieldText } from "@/components/form/form-field-text";

import { useAdjustCartonMutation } from "../packaging.mutations";

import type { CartonDto } from "../packaging.types";

type Values = { pairsPerCarton: number; packDueDate: string };

type Props = { carton: CartonDto | null; onOpenChange: (open: boolean) => void };

export function CartonAdjustDialog({ carton, onOpenChange }: Props) {
  const { t } = useTranslation("packaging");
  const adjust = useAdjustCartonMutation();
  const schema = useMemo(
    () =>
      z.object({
        pairsPerCarton: z.coerce.number().int().min(1, t("PAIRS_PER_CARTON_RULE")).max(10000),
        packDueDate: z.string(),
      }) as unknown as z.ZodType<Values>,
    [t],
  );
  if (!carton) return null;
  return (
    <FormDialog<Values>
      defaultValues={{ pairsPerCarton: carton.pairsPerCarton, packDueDate: carton.packDueDate ?? "" }}
      description={t("ADJUST_DESC", { docNo: carton.docNo })}
      open
      schema={schema}
      title={t("ACTION_ADJUST")}
      onOpenChange={onOpenChange}
      onSubmit={(values) =>
        adjust.mutateAsync({
          id: carton.id,
          input: {
            version: carton.version,
            pairsPerCarton: values.pairsPerCarton,
            packDueDate: values.packDueDate || null,
          },
        })
      }
    >
      {(form) => (
        <div className="grid gap-4">
          <FormFieldText
            error={form.formState.errors.pairsPerCarton?.message}
            label={t("F_pairsPerCarton")}
            name="pairsPerCarton"
            register={form.register}
            type="number"
          />
          <FormFieldDate label={t("PACK_DUE")} name="packDueDate" register={form.register} />
        </div>
      )}
    </FormDialog>
  );
}
