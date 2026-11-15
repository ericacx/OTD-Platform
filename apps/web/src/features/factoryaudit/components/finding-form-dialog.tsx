import { SEVERITIES, pickLabel, type Severity } from "@otd/shared";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import { FormDialog } from "@/components/biz/form-dialog";
import { FormFieldDate } from "@/components/form/form-field-date";
import { FormFieldSelect } from "@/components/form/form-field-select";
import { FormFieldText } from "@/components/form/form-field-text";
import { FormFieldTextarea } from "@/components/form/form-field-textarea";

import { useAddFindingMutation, useUpdateFindingMutation } from "../factoryaudit.mutations";

import type { FindingDto } from "../factoryaudit.types";

const LEVELS = Object.keys(SEVERITIES) as Severity[];

export type FindingFormTarget = { kind: "add"; auditId: string } | { kind: "edit"; finding: FindingDto };

type FindingFormDialogProps = { target: FindingFormTarget | null; onClose: () => void };

export function FindingFormDialog({ target, onClose }: FindingFormDialogProps) {
  const { t, i18n } = useTranslation("factoryaudit");
  const add = useAddFindingMutation();
  const update = useUpdateFindingMutation();
  const finding = target?.kind === "edit" ? target.finding : null;
  const schema = useMemo(
    () =>
      z.object({
        item: z.string().trim().min(1, t("REQUIRED")).max(200),
        severity: z.enum(["HIGH", "MEDIUM", "LOW"]),
        correctiveAction: z.string().max(500),
        responsible: z.string().max(60),
        dueDate: z.string(),
      }),
    [t],
  );
  const defaults = useMemo(
    () => ({
      item: finding?.item ?? "",
      severity: finding?.severity ?? "MEDIUM",
      correctiveAction: finding?.correctiveAction ?? "",
      responsible: finding?.responsible ?? "",
      dueDate: finding?.dueDate ?? "",
    }),
    [finding],
  );

  return (
    <FormDialog
      defaultValues={defaults}
      open={target !== null}
      schema={schema}
      title={finding ? t("EDIT_FINDING") : t("ADD_FINDING")}
      width="md"
      onOpenChange={(open) => !open && onClose()}
      onSubmit={(values) => {
        const input = {
          item: values.item,
          severity: values.severity,
          correctiveAction: values.correctiveAction || null,
          responsible: values.responsible || null,
          dueDate: values.dueDate || null,
        };
        if (target?.kind === "edit") {
          return update.mutateAsync({ id: target.finding.id, input: { ...input, version: target.finding.version } });
        }
        if (target?.kind === "add") return add.mutateAsync({ auditId: target.auditId, input });
        return Promise.resolve();
      }}
    >
      {(form) => (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <FormFieldText
              error={form.formState.errors.item?.message}
              label={t("ITEM")}
              name="item"
              register={form.register}
            />
          </div>
          <FormFieldSelect
            label={t("SEVERITY")}
            name="severity"
            options={LEVELS.map((s) => ({ value: s, label: pickLabel(SEVERITIES[s].label, i18n.language) }))}
            register={form.register}
          />
          <FormFieldDate label={t("DUE_DATE")} name="dueDate" register={form.register} />
          <FormFieldText label={t("RESPONSIBLE")} name="responsible" register={form.register} />
          <div className="sm:col-span-2">
            <FormFieldTextarea
              label={t("CORRECTIVE_ACTION")}
              name="correctiveAction"
              register={form.register}
              rows={3}
            />
          </div>
        </div>
      )}
    </FormDialog>
  );
}
