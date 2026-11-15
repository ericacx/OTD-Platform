import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import { FormDialog } from "@/components/biz/form-dialog";
import { FormFieldSelect } from "@/components/form/form-field-select";
import { FormFieldText } from "@/components/form/form-field-text";
import { FormFieldTextarea } from "@/components/form/form-field-textarea";

import { usePlanActionMutation } from "../packaging.mutations";

import type { PackagingPlanDetailDto } from "../packaging.types";

export const CONFIRM_METHODS = ["EMAIL", "CUSTOMER_SYSTEM", "OFFLINE"] as const;

type Values = { confirmedBy: string; method: (typeof CONFIRM_METHODS)[number]; note: string };

type Props = { open: boolean; onOpenChange: (open: boolean) => void; plan: PackagingPlanDetailDto };

export function PlanConfirmDialog({ open, onOpenChange, plan }: Props) {
  const { t } = useTranslation("packaging");
  const action = usePlanActionMutation(plan.id);
  const schema = useMemo(
    () =>
      z.object({
        confirmedBy: z.string().trim().min(1, t("REQUIRED")).max(80),
        method: z.enum(CONFIRM_METHODS),
        note: z.string().trim().max(300),
      }),
    [t],
  );
  return (
    <FormDialog<Values>
      defaultValues={{ confirmedBy: "", method: "EMAIL", note: "" }}
      description={t("CONFIRM_DESC", { docNo: plan.docNo, version: plan.currentVersion })}
      open={open}
      schema={schema}
      submitLabel={t("CONFIRM_SUBMIT")}
      title={t("ACTION_CONFIRM")}
      onOpenChange={onOpenChange}
      onSubmit={(values) =>
        action.mutateAsync({
          kind: "confirm",
          version: plan.version,
          confirmedBy: values.confirmedBy,
          method: values.method,
          note: values.note || null,
        })
      }
    >
      {(form) => (
        <div className="grid gap-4">
          <FormFieldText
            error={form.formState.errors.confirmedBy?.message}
            label={t("CONFIRMED_BY")}
            name="confirmedBy"
            register={form.register}
          />
          <FormFieldSelect
            label={t("CONFIRM_METHOD")}
            name="method"
            options={CONFIRM_METHODS.map((m) => ({ value: m, label: t(`METHOD_${m}`) }))}
            register={form.register}
          />
          <FormFieldTextarea label={t("CONFIRM_NOTE")} name="note" register={form.register} rows={2} />
        </div>
      )}
    </FormDialog>
  );
}
