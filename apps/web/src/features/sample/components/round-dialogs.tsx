import { ROUND_TYPES } from "@otd/contracts/sample";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { z } from "zod";

import { FormDialog } from "@/components/biz/form-dialog";
import { FormFieldDate } from "@/components/form/form-field-date";
import { FormFieldSelect } from "@/components/form/form-field-select";
import { FormFieldText } from "@/components/form/form-field-text";
import { FormFieldTextarea } from "@/components/form/form-field-textarea";
import { useDictOptions } from "@/features/planning/dict";

import { useAdvanceRoundMutation, useApproveRoundMutation, useCreateRoundMutation } from "../sample.mutations";

import type { RoundDto, RoundStatus, SampleDetailDto } from "../sample.types";

type AdvanceTarget = "RECEIVING" | "SOURCING" | "KNITTING" | "QC" | "READY" | "AWAITING_APPROVAL";

export const NEXT_STAGES: Partial<Record<RoundStatus, AdvanceTarget[]>> = {
  ISSUED: ["RECEIVING"],
  RECEIVING: ["SOURCING"],
  SOURCING: ["KNITTING"],
  KNITTING: ["QC"],
  QC: ["READY", "KNITTING"],
  READY: ["AWAITING_APPROVAL"],
  SHIPPED: ["AWAITING_APPROVAL"],
};

const advanceSchema = z.object({
  to: z.enum(["RECEIVING", "SOURCING", "KNITTING", "QC", "READY", "AWAITING_APPROVAL"]),
  location: z.string().max(120),
  note: z.string().max(1000),
});

type DialogProps = { round: RoundDto | null; onOpenChange: (open: boolean) => void };

export function AdvanceRoundDialog({ round, onOpenChange, location }: DialogProps & { location: string | null }) {
  const { t } = useTranslation("sample");
  const advance = useAdvanceRoundMutation();
  const targets = round ? (NEXT_STAGES[round.status] ?? []) : [];
  return (
    <FormDialog
      defaultValues={{ to: targets[0] ?? "RECEIVING", location: location ?? "", note: "" }}
      open={round !== null && targets.length > 0}
      schema={advanceSchema}
      submitLabel={t("ADVANCE_SUBMIT")}
      title={t("ADVANCE_TITLE")}
      onOpenChange={onOpenChange}
      onSubmit={async (values) => {
        if (!round) return;
        await advance.mutateAsync({
          roundId: round.id,
          input: {
            to: values.to,
            version: round.version,
            ...(values.location.trim() ? { location: values.location.trim() } : {}),
            ...(values.note.trim() ? { note: values.note.trim() } : {}),
          },
        });
        toast.success(t("ADVANCED_OK", { stage: t(`ST_${values.to}`) }));
      }}
    >
      {(form) => (
        <div className="space-y-4">
          <FormFieldSelect
            label={t("ADVANCE_TO")}
            name="to"
            options={targets.map((s) => ({
              value: s,
              label: round?.status === "QC" && s === "KNITTING" ? t("REWORK") : t(`ST_${s}`),
            }))}
            register={form.register}
          />
          <FormFieldText label={t("F_LOCATION")} name="location" register={form.register} />
          <FormFieldTextarea label={t("F_NOTE")} name="note" register={form.register} rows={3} />
        </div>
      )}
    </FormDialog>
  );
}

const approveSchema = z.object({
  result: z.enum(["APPROVED", "REVISE"]),
  note: z.string().max(2000),
  approvalDate: z.string(),
  nextRoundType: z.string(),
});

export function ApproveRoundDialog({ round, onOpenChange }: DialogProps) {
  const { t } = useTranslation("sample");
  const approve = useApproveRoundMutation();
  const roundTypes = useDictOptions("roundType", [...ROUND_TYPES]);
  return (
    <FormDialog
      defaultValues={{ result: "APPROVED", note: "", approvalDate: "", nextRoundType: round?.roundType ?? "PROTO" }}
      open={round !== null}
      schema={approveSchema}
      submitLabel={t("APPROVE_SUBMIT")}
      title={t("APPROVE_TITLE")}
      onOpenChange={onOpenChange}
      onSubmit={async (values) => {
        if (!round) return;
        const result = await approve.mutateAsync({
          roundId: round.id,
          input: {
            result: values.result,
            version: round.version,
            ...(values.note.trim() ? { note: values.note.trim() } : {}),
            ...(values.approvalDate ? { approvalDate: values.approvalDate } : {}),
            ...(values.result === "REVISE" ? { nextRoundType: values.nextRoundType as RoundDto["roundType"] } : {}),
          },
        });
        toast.success(
          values.result === "APPROVED"
            ? t("APPROVED_OK")
            : t("REVISED_OK", { round: result.currentRound?.roundNo ?? 0 }),
        );
      }}
    >
      {(form) => (
        <div className="grid gap-4 sm:grid-cols-2">
          <FormFieldSelect
            label={t("APPROVE_RESULT")}
            name="result"
            options={[
              { value: "APPROVED", label: t("ST_APPROVED") },
              { value: "REVISE", label: t("ST_REVISE") },
            ]}
            register={form.register}
          />
          <FormFieldDate label={t("APPROVE_DATE")} name="approvalDate" register={form.register} />
          {form.watch("result") === "REVISE" ? (
            <FormFieldSelect
              label={t("NEXT_ROUND_TYPE")}
              name="nextRoundType"
              options={roundTypes}
              register={form.register}
            />
          ) : null}
          <div className="sm:col-span-2">
            <FormFieldTextarea label={t("APPROVE_NOTE")} name="note" register={form.register} rows={3} />
          </div>
        </div>
      )}
    </FormDialog>
  );
}

const newRoundSchema = z.object({
  roundType: z.string().min(1),
  quantity: z.coerce.number().int().min(1).max(10000),
  dueDate: z.string(),
});

export function NewRoundDialog({
  sample,
  open,
  onOpenChange,
}: {
  sample: SampleDetailDto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation("sample");
  const create = useCreateRoundMutation();
  const roundTypes = useDictOptions("roundType", [...ROUND_TYPES]);
  const defaults = useMemo(() => ({ roundType: "SMS", quantity: 6, dueDate: sample.dueDate ?? "" }), [sample.dueDate]);
  return (
    <FormDialog
      defaultValues={defaults}
      open={open}
      schema={newRoundSchema}
      title={t("NEW_ROUND")}
      onOpenChange={onOpenChange}
      onSubmit={async (values) => {
        await create.mutateAsync({
          sampleId: sample.id,
          input: {
            roundType: values.roundType as RoundDto["roundType"],
            quantity: values.quantity,
            version: sample.version,
            ...(values.dueDate ? { dueDate: values.dueDate } : {}),
          },
        });
        toast.success(t("ROUND_CREATED"));
      }}
    >
      {(form) => (
        <div className="grid gap-4 sm:grid-cols-3">
          <FormFieldSelect label={t("ROUND_TYPE")} name="roundType" options={roundTypes} register={form.register} />
          <FormFieldText label={t("F_QTY")} name="quantity" register={form.register} type="number" />
          <FormFieldDate label={t("F_DUE")} name="dueDate" register={form.register} />
        </div>
      )}
    </FormDialog>
  );
}
