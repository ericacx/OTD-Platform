import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { z } from "zod";

import { FileUpload, type UploadedFile } from "@/components/biz/file-upload";
import { FormDialog } from "@/components/biz/form-dialog";
import { FormFieldDate } from "@/components/form/form-field-date";
import { FormFieldSelect } from "@/components/form/form-field-select";
import { FormFieldText } from "@/components/form/form-field-text";
import { FormFieldTextarea } from "@/components/form/form-field-textarea";

import { useTestActionMutation, useUpdateReportMutation } from "../testing.mutations";

import type { TestReportDto, TestRequestDto } from "../testing.types";

type Props = { request: TestRequestDto | null; onOpenChange: (open: boolean) => void };

const opt = (v: string) => (v.trim() ? v.trim() : undefined);

const submitSchema = z.object({ sentDate: z.string(), trackingNo: z.string().max(60) });

export function SubmitTestDialog({ request, onOpenChange }: Props) {
  const { t } = useTranslation("testing");
  const action = useTestActionMutation();
  return (
    <FormDialog
      defaultValues={{ sentDate: "", trackingNo: request?.trackingNo ?? "" }}
      open={request !== null}
      schema={submitSchema}
      submitLabel={t("ACT_SUBMIT")}
      title={t("SUBMIT_TITLE")}
      onOpenChange={onOpenChange}
      onSubmit={async (values) => {
        if (!request) return;
        const sentDate = opt(values.sentDate);
        const trackingNo = opt(values.trackingNo);
        await action.mutateAsync({
          id: request.id,
          action: "submit",
          input: { version: request.version, ...(sentDate ? { sentDate } : {}), ...(trackingNo ? { trackingNo } : {}) },
        });
        toast.success(t("SUBMITTED_OK"));
      }}
    >
      {(form) => (
        <div className="grid gap-4 sm:grid-cols-2">
          <FormFieldDate label={t("F_SENT")} name="sentDate" register={form.register} />
          <FormFieldText label={t("F_TRACKING")} name="trackingNo" register={form.register} />
        </div>
      )}
    </FormDialog>
  );
}

const receiveSchema = z.object({ labReceivedDate: z.string(), dueDate: z.string(), trackingNo: z.string().max(60) });

export function ReceiveTestDialog({ request, onOpenChange }: Props) {
  const { t } = useTranslation("testing");
  const action = useTestActionMutation();
  return (
    <FormDialog
      defaultValues={{ labReceivedDate: "", dueDate: "", trackingNo: request?.trackingNo ?? "" }}
      description={t("RECEIVE_DESC")}
      open={request !== null}
      schema={receiveSchema}
      submitLabel={t("ACT_RECEIVE")}
      title={t("RECEIVE_TITLE")}
      onOpenChange={onOpenChange}
      onSubmit={async (values) => {
        if (!request) return;
        const labReceivedDate = opt(values.labReceivedDate);
        const dueDate = opt(values.dueDate);
        const trackingNo = opt(values.trackingNo);
        await action.mutateAsync({
          id: request.id,
          action: "receive",
          input: {
            version: request.version,
            ...(labReceivedDate ? { labReceivedDate } : {}),
            ...(dueDate ? { dueDate } : {}),
            ...(trackingNo ? { trackingNo } : {}),
          },
        });
        toast.success(t("RECEIVED_OK"));
      }}
    >
      {(form) => (
        <div className="grid gap-4 sm:grid-cols-3">
          <FormFieldDate label={t("F_LAB_RECEIVED")} name="labReceivedDate" register={form.register} />
          <FormFieldDate label={t("F_DUE")} name="dueDate" register={form.register} />
          <FormFieldText label={t("F_TRACKING")} name="trackingNo" register={form.register} />
        </div>
      )}
    </FormDialog>
  );
}

const completeSchema = z.object({
  result: z.enum(["PASS", "FAIL"]),
  agencyReportNo: z.string().trim().min(1).max(60),
  issuedDate: z.string().min(1),
  validUntil: z.string(),
  failedItems: z.string().max(1000),
  correctiveAction: z.string().max(1000),
  resultNote: z.string().max(500),
  structure: z.string().max(120),
  craft: z.string().max(120),
  yarn: z.string().max(120),
});

const COMPLETE_DEFAULTS: z.infer<typeof completeSchema> = {
  result: "PASS",
  agencyReportNo: "",
  issuedDate: "",
  validUntil: "",
  failedItems: "",
  correctiveAction: "",
  resultNote: "",
  structure: "",
  craft: "",
  yarn: "",
};

export function CompleteTestDialog({ request, onOpenChange }: Props) {
  const { t } = useTranslation("testing");
  const action = useTestActionMutation();
  const [file, setFile] = useState<UploadedFile | null>(null);
  return (
    <FormDialog
      defaultValues={COMPLETE_DEFAULTS}
      description={t("COMPLETE_DESC")}
      open={request !== null}
      schema={completeSchema}
      submitLabel={t("ACT_COMPLETE")}
      title={t("COMPLETE_TITLE")}
      width="md"
      onOpenChange={(open) => {
        if (!open) setFile(null);
        onOpenChange(open);
      }}
      onSubmit={async (values) => {
        if (!request) return;
        const validUntil = opt(values.validUntil);
        const failedItems = opt(values.failedItems);
        const correctiveAction = opt(values.correctiveAction);
        const resultNote = opt(values.resultNote);
        await action.mutateAsync({
          id: request.id,
          action: "complete",
          input: {
            version: request.version,
            result: values.result,
            report: {
              agencyReportNo: values.agencyReportNo,
              issuedDate: values.issuedDate,
              ...(validUntil ? { validUntil } : {}),
              ...(file ? { fileId: file.id } : {}),
              reuseKey: {
                ...(opt(values.structure) ? { structure: values.structure.trim() } : {}),
                ...(opt(values.craft) ? { craft: values.craft.trim() } : {}),
                ...(opt(values.yarn) ? { yarn: values.yarn.trim() } : {}),
              },
            },
            ...(failedItems ? { failedItems } : {}),
            ...(correctiveAction ? { correctiveAction } : {}),
            ...(resultNote ? { resultNote } : {}),
          },
        });
        toast.success(t("COMPLETED_OK"));
        setFile(null);
      }}
    >
      {(form) => (
        <div className="grid gap-4 sm:grid-cols-2">
          <FormFieldSelect
            label={t("F_RESULT")}
            name="result"
            options={[
              { value: "PASS", label: t("RESULT_PASS") },
              { value: "FAIL", label: t("RESULT_FAIL") },
            ]}
            register={form.register}
          />
          <FormFieldText
            error={form.formState.errors.agencyReportNo ? t("REPORT_NO_REQUIRED") : undefined}
            label={t("F_AGENCY_REPORT_NO")}
            name="agencyReportNo"
            register={form.register}
          />
          <FormFieldDate
            error={form.formState.errors.issuedDate ? t("ISSUED_REQUIRED") : undefined}
            label={t("F_ISSUED")}
            name="issuedDate"
            register={form.register}
          />
          <FormFieldDate label={t("F_VALID_UNTIL_OPTIONAL")} name="validUntil" register={form.register} />
          {form.watch("result") === "FAIL" ? (
            <>
              <FormFieldTextarea label={t("F_FAILED_ITEMS")} name="failedItems" register={form.register} rows={2} />
              <FormFieldTextarea label={t("F_CORRECTIVE")} name="correctiveAction" register={form.register} rows={2} />
            </>
          ) : null}
          <div className="grid gap-4 sm:col-span-2 sm:grid-cols-3">
            <FormFieldText label={t("F_STRUCTURE")} name="structure" register={form.register} />
            <FormFieldText label={t("F_CRAFT")} name="craft" register={form.register} />
            <FormFieldText label={t("F_YARN")} name="yarn" register={form.register} />
          </div>
          <div className="sm:col-span-2">
            <FormFieldText
              label={t("F_RESULT_NOTE")}
              name="resultNote"
              placeholder={t("RESULT_NOTE_DEFAULT")}
              register={form.register}
            />
          </div>
          <div className="sm:col-span-2">
            {file ? (
              <p className="text-sm">
                {t("REPORT_FILE")}：<span className="font-medium">{file.filename}</span>
              </p>
            ) : (
              <FileUpload accept=".pdf,.png,.jpg,.jpeg" hint={t("REPORT_FILE_HINT")} onUploaded={setFile} />
            )}
          </div>
        </div>
      )}
    </FormDialog>
  );
}

const reportSchema = z.object({ validUntil: z.string().min(1) });

export function ReportEditDialog({
  report,
  onOpenChange,
}: {
  report: TestReportDto | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation("testing");
  const update = useUpdateReportMutation();
  const [file, setFile] = useState<UploadedFile | null>(null);
  return (
    <FormDialog
      defaultValues={{ validUntil: report?.validUntil ?? "" }}
      open={report !== null}
      schema={reportSchema}
      title={t("REPORT_EDIT_TITLE", { no: report?.agencyReportNo ?? "" })}
      onOpenChange={(open) => {
        if (!open) setFile(null);
        onOpenChange(open);
      }}
      onSubmit={async (values) => {
        if (!report) return;
        await update.mutateAsync({
          id: report.id,
          input: { version: report.version, validUntil: values.validUntil, ...(file ? { fileId: file.id } : {}) },
        });
        toast.success(t("REPORT_SAVED"));
        setFile(null);
      }}
    >
      {(form) => (
        <div className="space-y-4">
          <FormFieldDate label={t("F_VALID_UNTIL")} name="validUntil" register={form.register} />
          {file ? (
            <p className="text-sm">
              {t("REPORT_FILE")}：<span className="font-medium">{file.filename}</span>
            </p>
          ) : (
            <FileUpload accept=".pdf,.png,.jpg,.jpeg" hint={t("REPORT_FILE_HINT")} onUploaded={setFile} />
          )}
        </div>
      )}
    </FormDialog>
  );
}
