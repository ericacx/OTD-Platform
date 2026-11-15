import { pickLabel, statusLabel } from "@otd/shared";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import { FormDialog } from "@/components/biz/form-dialog";
import { FormFieldDate } from "@/components/form/form-field-date";
import { FormFieldSelect } from "@/components/form/form-field-select";
import { FormFieldText } from "@/components/form/form-field-text";
import { FormFieldTextarea } from "@/components/form/form-field-textarea";
import { formatDate } from "@/lib/date";

import {
  useAdvanceOrderMutation,
  useCancelOrderMutation,
  useCustomerConfirmMutation,
  useFactoryReplyMutation,
  useRecordProductionMutation,
} from "../order.mutations";

import type { OrderDetail } from "../order.types";

type DialogProps = { order: OrderDetail; open: boolean; onOpenChange: (open: boolean) => void };

const note = z.string().trim().max(500);

export function FactoryReplyDialog({ order, open, onOpenChange }: DialogProps) {
  const { t } = useTranslation("order");
  const save = useFactoryReplyMutation();
  const schema = useMemo(() => z.object({ replyDate: z.iso.date(), note }), []);
  return (
    <FormDialog
      defaultValues={{ replyDate: order.factoryReplyDate ?? order.customerDueDate, note: "" }}
      description={t("REPLY_HINT", { due: order.customerDueDate })}
      open={open}
      schema={schema}
      title={t("REPLY_TITLE", { n: order.factoryReplies.length + 1 })}
      onOpenChange={onOpenChange}
      onSubmit={(values) =>
        save.mutateAsync({
          id: order.id,
          version: order.version,
          replyDate: values.replyDate,
          note: values.note || undefined,
        })
      }
    >
      {(form) => (
        <>
          <FormFieldDate
            error={form.formState.errors.replyDate?.message}
            label={t("REPLY_DATE")}
            name="replyDate"
            register={form.register}
          />
          <FormFieldTextarea label={t("NOTE_OPTIONAL")} name="note" register={form.register} rows={2} />
        </>
      )}
    </FormDialog>
  );
}

export function CustomerConfirmDialog({ order, open, onOpenChange }: DialogProps) {
  const { t } = useTranslation("order");
  const save = useCustomerConfirmMutation();
  const schema = useMemo(() => z.object({ method: z.enum(["EMAIL", "CUSTOMER_SYSTEM", "OFFLINE"]), note }), []);
  return (
    <FormDialog
      defaultValues={{ method: "EMAIL" as const, note: "" }}
      open={open}
      schema={schema}
      title={t("CC_TITLE")}
      onOpenChange={onOpenChange}
      onSubmit={(values) =>
        save.mutateAsync({
          id: order.id,
          version: order.version,
          method: values.method,
          note: values.note || undefined,
        })
      }
    >
      {(form) => (
        <>
          <FormFieldSelect
            label={t("CC_METHOD")}
            name="method"
            options={[
              { value: "EMAIL", label: t("METHOD_EMAIL") },
              { value: "CUSTOMER_SYSTEM", label: t("METHOD_CUSTOMER_SYSTEM") },
              { value: "OFFLINE", label: t("METHOD_OFFLINE") },
            ]}
            register={form.register}
          />
          <FormFieldTextarea label={t("NOTE_OPTIONAL")} name="note" register={form.register} rows={2} />
        </>
      )}
    </FormDialog>
  );
}

export function AdvanceOrderDialog({ order, open, onOpenChange }: DialogProps) {
  const { t, i18n } = useTranslation("order");
  const save = useAdvanceOrderMutation();
  const schema = useMemo(() => z.object({ note }), []);
  const next = order.nextStatus ? pickLabel(statusLabel("order", order.nextStatus), i18n.language) : "";
  return (
    <FormDialog
      defaultValues={{ note: "" }}
      description={t("ADVANCE_DESC")}
      open={open}
      schema={schema}
      submitLabel={t("BTN_ADVANCE", { status: next })}
      title={t("BTN_ADVANCE", { status: next })}
      onOpenChange={onOpenChange}
      onSubmit={(values) => save.mutateAsync({ id: order.id, version: order.version, note: values.note || undefined })}
    >
      {(form) => <FormFieldTextarea label={t("NOTE_OPTIONAL")} name="note" register={form.register} rows={2} />}
    </FormDialog>
  );
}

export function CancelOrderDialog({ order, open, onOpenChange }: DialogProps) {
  const { t } = useTranslation("order");
  const save = useCancelOrderMutation();
  const schema = useMemo(() => z.object({ reason: z.string().trim().min(2).max(500) }), []);
  return (
    <FormDialog
      defaultValues={{ reason: "" }}
      description={t("CANCEL_HINT")}
      open={open}
      schema={schema}
      submitLabel={t("BTN_CANCEL")}
      title={t("CANCEL_TITLE", { po: order.poNo })}
      onOpenChange={onOpenChange}
      onSubmit={(values) => save.mutateAsync({ id: order.id, version: order.version, reason: values.reason })}
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

export function ProductionDialog({ order, open, onOpenChange }: DialogProps) {
  const { t } = useTranslation("order");
  const save = useRecordProductionMutation();
  const latest = order.production[0];
  const schema = useMemo(
    () =>
      z.object({
        reportDate: z.iso.date(),
        knittedPairs: z.coerce.number().int().min(0),
        packedPairs: z.coerce.number().int().min(0),
        note,
      }),
    [],
  );
  return (
    <FormDialog
      defaultValues={{
        reportDate: formatDate(new Date()),
        knittedPairs: latest?.knittedPairs ?? 0,
        packedPairs: latest?.packedPairs ?? 0,
        note: "",
      }}
      open={open}
      schema={schema}
      title={t("BTN_PRODUCTION")}
      onOpenChange={onOpenChange}
      onSubmit={(values) =>
        save.mutateAsync({
          id: order.id,
          reportDate: values.reportDate,
          knittedPairs: values.knittedPairs,
          packedPairs: values.packedPairs,
          note: values.note || undefined,
        })
      }
    >
      {(form) => (
        <>
          <FormFieldDate
            error={form.formState.errors.reportDate?.message}
            label={t("PROD_DATE")}
            name="reportDate"
            register={form.register}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <FormFieldText
              error={form.formState.errors.knittedPairs?.message}
              label={t("PROD_KNITTED")}
              name="knittedPairs"
              register={form.register}
              type="number"
            />
            <FormFieldText
              error={form.formState.errors.packedPairs?.message}
              label={t("PROD_PACKED")}
              name="packedPairs"
              register={form.register}
              type="number"
            />
          </div>
          <FormFieldTextarea label={t("NOTE_OPTIONAL")} name="note" register={form.register} rows={2} />
        </>
      )}
    </FormDialog>
  );
}
