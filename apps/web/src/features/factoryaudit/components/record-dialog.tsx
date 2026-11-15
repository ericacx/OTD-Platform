import { AUDIT_RESULTS } from "@otd/contracts/factoryaudit";
import { pickLabel } from "@otd/shared";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import { FormDialog } from "@/components/biz/form-dialog";
import { FormFieldDate } from "@/components/form/form-field-date";
import { FormFieldSelect } from "@/components/form/form-field-select";
import { FormFieldText } from "@/components/form/form-field-text";
import { FormFieldTextarea } from "@/components/form/form-field-textarea";
import { formatDate } from "@/lib/date";

import { useRecordAuditMutation } from "../factoryaudit.mutations";

import type { AuditResult, FactoryAuditDto } from "../factoryaudit.types";

const RESULTS = Object.keys(AUDIT_RESULTS) as AuditResult[];

type RecordDialogProps = { audit: FactoryAuditDto | null; onClose: () => void };

export function RecordDialog({ audit, onClose }: RecordDialogProps) {
  const { t, i18n } = useTranslation("factoryaudit");
  const record = useRecordAuditMutation();
  const schema = useMemo(
    () =>
      z.object({
        actualDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, t("REQUIRED")),
        result: z.enum(["PASS", "CONDITIONAL", "FAIL"]),
        score: z.string().refine((v) => v.trim() === "" || (Number(v) >= 0 && Number(v) <= 100), t("SCORE_RANGE")),
        certificateValidUntil: z.string(),
        auditor: z.string().max(120),
        note: z.string().max(500),
      }),
    [t],
  );
  const defaults = useMemo(
    () => ({
      actualDate: audit?.actualDate ?? formatDate(new Date()),
      result: audit?.result ?? "PASS",
      score: audit?.score === null || audit?.score === undefined ? "" : String(audit.score),
      certificateValidUntil: audit?.certificateValidUntil ?? "",
      auditor: audit?.auditor ?? "",
      note: audit?.note ?? "",
    }),
    [audit],
  );

  return (
    <FormDialog
      defaultValues={defaults}
      open={audit !== null}
      schema={schema}
      title={t("RECORD_TITLE")}
      width="md"
      onOpenChange={(open) => !open && onClose()}
      onSubmit={(values) => {
        if (!audit) return Promise.resolve();
        return record.mutateAsync({
          id: audit.id,
          input: {
            actualDate: values.actualDate,
            result: values.result,
            score: values.score.trim() === "" ? null : Number(values.score),
            certificateValidUntil: values.certificateValidUntil || null,
            auditor: values.auditor || null,
            note: values.note || null,
            version: audit.version,
          },
        });
      }}
    >
      {(form) => (
        <div className="grid gap-4 sm:grid-cols-2">
          <FormFieldDate
            error={form.formState.errors.actualDate?.message}
            label={t("ACTUAL_DATE")}
            name="actualDate"
            register={form.register}
          />
          <FormFieldSelect
            label={t("RESULT")}
            name="result"
            options={RESULTS.map((r) => ({ value: r, label: pickLabel(AUDIT_RESULTS[r], i18n.language) }))}
            register={form.register}
          />
          <FormFieldText
            error={form.formState.errors.score?.message}
            label={t("SCORE")}
            name="score"
            register={form.register}
            step="0.1"
            type="number"
          />
          <FormFieldDate label={t("CERT_UNTIL")} name="certificateValidUntil" register={form.register} />
          <FormFieldText label={t("AUDITOR")} name="auditor" register={form.register} />
          <div className="sm:col-span-2">
            <FormFieldTextarea label={t("NOTE")} name="note" register={form.register} rows={3} />
          </div>
        </div>
      )}
    </FormDialog>
  );
}
