import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import { FormDialog } from "@/components/biz/form-dialog";
import { FormFieldDate } from "@/components/form/form-field-date";
import { FormFieldSelect } from "@/components/form/form-field-select";
import { FormFieldText } from "@/components/form/form-field-text";
import { FormFieldTextarea } from "@/components/form/form-field-textarea";

import {
  useCancelInspectionMutation,
  useRecordInspectionMutation,
  useReleaseInspectionMutation,
  useReworkInspectionMutation,
  useScheduleInspectionMutation,
} from "../inspection.mutations";
import { useReleaseCheckQuery } from "../inspection.queries";

import { GateChecklist } from "./release-gate-card";

import type { InspectionDto } from "@otd/contracts/inspection";

type DialogProps = { inspection: InspectionDto | null; onClose: () => void };

const today = () => new Date().toISOString().slice(0, 10);
const nonNegativeInt = (message: string) => z.string().regex(/^\d+$/, message);

export function ScheduleDialog({ inspection, onClose }: DialogProps) {
  const { t } = useTranslation("inspection");
  const schedule = useScheduleInspectionMutation();
  const schema = useMemo(
    () =>
      z.object({
        plannedDate: z.string().min(1, t("DATE_REQUIRED")),
        inspector: z.string().max(60),
        channel: z.string().max(60),
        plannedSampleQty: z.union([z.literal(""), nonNegativeInt(t("INT_INVALID"))]),
      }),
    [t],
  );
  if (!inspection) return null;
  return (
    <FormDialog
      defaultValues={{
        plannedDate: inspection.plannedDate ?? "",
        inspector: inspection.inspector ?? "",
        channel: inspection.channel ?? "",
        plannedSampleQty: inspection.plannedSampleQty != null ? String(inspection.plannedSampleQty) : "",
      }}
      description={t("SCHEDULE_DESC")}
      open
      schema={schema}
      title={t("SCHEDULE_TITLE", { no: inspection.docNo })}
      onOpenChange={(open) => !open && onClose()}
      onSubmit={(values) =>
        schedule.mutateAsync({
          id: inspection.id,
          input: {
            version: inspection.version,
            plannedDate: values.plannedDate,
            inspector: values.inspector || null,
            channel: values.channel || null,
            plannedSampleQty: values.plannedSampleQty ? Number(values.plannedSampleQty) : null,
          },
        })
      }
    >
      {(form) => (
        <div className="grid gap-4 sm:grid-cols-2">
          <FormFieldDate
            error={form.formState.errors.plannedDate?.message}
            label={t("PLANNED_DATE")}
            name="plannedDate"
            register={form.register}
          />
          <FormFieldText
            error={form.formState.errors.plannedSampleQty?.message}
            inputMode="numeric"
            label={t("PLANNED_SAMPLE")}
            name="plannedSampleQty"
            register={form.register}
          />
          <FormFieldText label={t("INSPECTOR")} name="inspector" register={form.register} />
          <FormFieldText label={t("CHANNEL")} name="channel" register={form.register} />
        </div>
      )}
    </FormDialog>
  );
}

export function ResultDialog({ inspection, onClose }: DialogProps) {
  const { t } = useTranslation("inspection");
  const record = useRecordInspectionMutation();
  const schema = useMemo(
    () =>
      z
        .object({
          result: z.enum(["PASS", "FAIL"]),
          actualDate: z.string().min(1, t("DATE_REQUIRED")),
          actualSampleQty: z.string().regex(/^[1-9]\d*$/, t("INT_INVALID")),
          defectQty: nonNegativeInt(t("INT_INVALID")),
          defectNote: z.string().max(500),
          correctiveAction: z.string().max(500),
          inspector: z.string().max(60),
        })
        .refine((v) => Number(v.defectQty) <= Number(v.actualSampleQty), {
          path: ["defectQty"],
          message: t("DEFECT_TOO_MANY"),
        }),
    [t],
  );
  if (!inspection) return null;
  const nextRound = inspection.status === "REWORK" ? inspection.roundNo + 1 : inspection.roundNo;
  return (
    <FormDialog
      defaultValues={{
        result: "PASS" as const,
        actualDate: inspection.plannedDate ?? today(),
        actualSampleQty: inspection.plannedSampleQty ? String(inspection.plannedSampleQty) : "",
        defectQty: "0",
        defectNote: "",
        correctiveAction: "",
        inspector: inspection.inspector ?? "",
      }}
      description={t("RESULT_DESC", { round: nextRound })}
      open
      schema={schema}
      title={t("RESULT_TITLE", { no: inspection.docNo })}
      width="md"
      onOpenChange={(open) => !open && onClose()}
      onSubmit={(values) =>
        record.mutateAsync({
          id: inspection.id,
          input: {
            version: inspection.version,
            result: values.result,
            actualDate: values.actualDate,
            actualSampleQty: Number(values.actualSampleQty),
            defectQty: Number(values.defectQty),
            defectNote: values.defectNote || null,
            correctiveAction: values.correctiveAction || null,
            inspector: values.inspector || null,
          },
        })
      }
    >
      {(form) => {
        const sample = Number(form.watch("actualSampleQty"));
        const defects = Number(form.watch("defectQty"));
        const rate = sample > 0 && Number.isFinite(defects) ? `${((defects / sample) * 100).toFixed(1)}%` : "—";
        return (
          <div className="grid gap-4 sm:grid-cols-2">
            <FormFieldSelect
              label={t("RESULT")}
              name="result"
              options={[
                { value: "PASS", label: t("PASS") },
                { value: "FAIL", label: t("FAIL") },
              ]}
              register={form.register}
            />
            <FormFieldDate
              error={form.formState.errors.actualDate?.message}
              label={t("ACTUAL_DATE")}
              name="actualDate"
              register={form.register}
            />
            <FormFieldText
              error={form.formState.errors.actualSampleQty?.message}
              inputMode="numeric"
              label={t("ACTUAL_SAMPLE")}
              name="actualSampleQty"
              register={form.register}
            />
            <FormFieldText
              error={form.formState.errors.defectQty?.message}
              inputMode="numeric"
              label={t("DEFECT_QTY")}
              name="defectQty"
              register={form.register}
            />
            <p className="text-sm text-muted-foreground sm:col-span-2">
              {t("DEFECT_RATE")}：<span className="tabular font-medium text-foreground">{rate}</span>
            </p>
            <FormFieldText label={t("INSPECTOR")} name="inspector" register={form.register} />
            <div className="sm:col-span-2">
              <FormFieldTextarea label={t("DEFECT_NOTE")} name="defectNote" register={form.register} rows={2} />
            </div>
            <div className="sm:col-span-2">
              <FormFieldTextarea
                label={t("CORRECTIVE_ACTION")}
                name="correctiveAction"
                register={form.register}
                rows={2}
              />
            </div>
          </div>
        );
      }}
    </FormDialog>
  );
}

export function ReworkDialog({ inspection, onClose }: DialogProps) {
  const { t } = useTranslation("inspection");
  const rework = useReworkInspectionMutation();
  const schema = useMemo(
    () => z.object({ correctiveAction: z.string().max(500), plannedDate: z.string(), note: z.string().max(500) }),
    [],
  );
  if (!inspection) return null;
  return (
    <FormDialog
      defaultValues={{ correctiveAction: inspection.correctiveAction ?? "", plannedDate: "", note: "" }}
      description={t("REWORK_DESC", { round: inspection.roundNo + 1 })}
      open
      schema={schema}
      title={t("REWORK_TITLE", { no: inspection.docNo })}
      onOpenChange={(open) => !open && onClose()}
      onSubmit={(values) =>
        rework.mutateAsync({
          id: inspection.id,
          input: {
            version: inspection.version,
            correctiveAction: values.correctiveAction || null,
            plannedDate: values.plannedDate || null,
            note: values.note || null,
          },
        })
      }
    >
      {(form) => (
        <div className="grid gap-4">
          <FormFieldTextarea label={t("CORRECTIVE_ACTION")} name="correctiveAction" register={form.register} rows={2} />
          <FormFieldDate label={t("REWORK_DATE")} name="plannedDate" register={form.register} />
          <FormFieldTextarea label={t("NOTE")} name="note" register={form.register} rows={2} />
        </div>
      )}
    </FormDialog>
  );
}

export function CancelDialog({ inspection, onClose }: DialogProps) {
  const { t } = useTranslation("inspection");
  const cancel = useCancelInspectionMutation();
  const schema = useMemo(() => z.object({ reason: z.string().trim().min(1, t("REASON_REQUIRED")).max(500) }), [t]);
  if (!inspection) return null;
  return (
    <FormDialog
      defaultValues={{ reason: "" }}
      open
      schema={schema}
      submitLabel={t("CANCEL_CONFIRM")}
      title={t("CANCEL_TITLE", { no: inspection.docNo })}
      onOpenChange={(open) => !open && onClose()}
      onSubmit={(values) =>
        cancel.mutateAsync({ id: inspection.id, input: { version: inspection.version, reason: values.reason } })
      }
    >
      {(form) => (
        <FormFieldTextarea
          error={form.formState.errors.reason?.message}
          label={t("CANCEL_REASON")}
          name="reason"
          register={form.register}
          rows={3}
        />
      )}
    </FormDialog>
  );
}

export function ReleaseDialog({ inspection, onClose }: DialogProps) {
  const { t } = useTranslation("inspection");
  const release = useReleaseInspectionMutation();
  const check = useReleaseCheckQuery(inspection?.id ?? "none");
  const concession = Boolean(check.data && !check.data.passed && check.data.concessionAvailable);
  const schema = useMemo(
    () =>
      z.object({
        concessionReason: concession ? z.string().trim().min(1, t("CONCESSION_REQUIRED")).max(1000) : z.string(),
        note: z.string().max(500),
      }),
    [concession, t],
  );
  if (!inspection) return null;
  return (
    <FormDialog
      defaultValues={{ concessionReason: "", note: "" }}
      description={concession ? t("CONCESSION_DESC") : t("RELEASE_DESC")}
      key={concession ? "concession" : "normal"}
      open
      schema={schema}
      submitLabel={concession ? t("CONCESSION_SUBMIT") : t("RELEASE")}
      title={t("RELEASE_TITLE", { no: inspection.docNo })}
      width="md"
      onOpenChange={(open) => !open && onClose()}
      onSubmit={(values) =>
        release.mutateAsync({
          id: inspection.id,
          input: {
            version: inspection.version,
            ...(concession ? { concessionReason: values.concessionReason } : {}),
            note: values.note || null,
          },
        })
      }
    >
      {(form) => (
        <div className="grid gap-4">
          {check.data ? <GateChecklist check={check.data} /> : null}
          {concession ? (
            <FormFieldTextarea
              error={form.formState.errors.concessionReason?.message}
              label={t("CONCESSION_REASON")}
              name="concessionReason"
              register={form.register}
              rows={3}
            />
          ) : null}
          <FormFieldTextarea label={t("NOTE")} name="note" register={form.register} rows={2} />
        </div>
      )}
    </FormDialog>
  );
}
