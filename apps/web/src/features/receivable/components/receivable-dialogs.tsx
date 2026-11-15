import { COLLECTION_CHANNELS, COLLECTION_RESULTS, RECEIVABLE_TYPES } from "@otd/contracts/receivable";
import { useMemo } from "react";
import { Controller } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import { FormDialog } from "@/components/biz/form-dialog";
import { Money } from "@/components/biz/money";
import { FormFieldDate } from "@/components/form/form-field-date";
import { FormFieldSelect } from "@/components/form/form-field-select";
import { FormFieldText } from "@/components/form/form-field-text";
import { FormFieldTextarea } from "@/components/form/form-field-textarea";
import { OrderPicker } from "@/features/inspection/components/order-picker";
import { useLookups } from "@/features/masterdata/lookups.queries";
import { formatDate } from "@/lib/date";

import { isOpen, resultLabel, useDictLabel } from "../receivable.labels";
import {
  useCollectionLogMutation,
  useCreateInvoiceMutation,
  useCreateReceivableMutation,
  useOffsetMutation,
  useReceiptMutation,
} from "../receivable.mutations";
import { useReceivablesQuery } from "../receivable.queries";

import type { ReceivableDto } from "@otd/contracts/receivable";

const AMOUNT = /^-?\d+(\.\d{1,2})?$/;
const POSITIVE = /^\d+(\.\d{1,2})?$/;
const today = () => formatDate(new Date());

type ArProps = { receivable: ReceivableDto | null; onClose: () => void };

function ArSummary({ ar }: { ar: ReceivableDto }) {
  const { t } = useTranslation("receivable");
  return (
    <div className="grid gap-1 rounded-lg border border-border bg-muted/30 p-3 text-sm sm:grid-cols-2">
      <span>
        {ar.docNo} · {ar.customerName}
      </span>
      <span className="sm:text-right">
        {t("OUTSTANDING")} <Money amount={ar.outstanding} className="font-semibold" currency={ar.currency} />
      </span>
      <span className="text-muted-foreground">{t("DUE_ON", { date: ar.dueDate })}</span>
      <span className="text-muted-foreground sm:text-right">
        {t("RECEIVED")} <Money amount={ar.receivedAmount} currency={ar.currency} /> /{" "}
        <Money amount={ar.amount} currency={ar.currency} />
      </span>
    </div>
  );
}

export function ReceiptDialog({ receivable, onClose }: ArProps) {
  const { t } = useTranslation("receivable");
  const receipt = useReceiptMutation();
  const max = receivable?.outstanding ?? 0;
  const schema = useMemo(
    () =>
      z.object({
        amount: z
          .string()
          .regex(POSITIVE, t("AMOUNT_INVALID"))
          .refine((v) => Number(v) > 0 && Number(v) <= max + 0.005, t("AMOUNT_EXCEEDS")),
        receivedAt: z.string().min(1, t("DATE_REQUIRED")),
        method: z.string().max(40),
        bankRef: z.string().max(80),
        note: z.string().max(500),
      }),
    [t, max],
  );
  if (!receivable) return null;
  return (
    <FormDialog
      defaultValues={{
        amount: String(receivable.outstanding),
        receivedAt: today(),
        method: "TT",
        bankRef: "",
        note: "",
      }}
      open
      schema={schema}
      title={t("RECEIPT_TITLE", { no: receivable.docNo })}
      onOpenChange={(open) => !open && onClose()}
      onSubmit={(values) =>
        receipt.mutateAsync({
          id: receivable.id,
          input: {
            version: receivable.version,
            amount: Number(values.amount),
            currency: receivable.currency,
            receivedAt: values.receivedAt,
            method: values.method || null,
            bankRef: values.bankRef || null,
            note: values.note || null,
          },
        })
      }
    >
      {(form) => (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <ArSummary ar={receivable} />
          </div>
          <FormFieldText
            error={form.formState.errors.amount?.message}
            inputMode="decimal"
            label={t("RECEIPT_AMOUNT", { currency: receivable.currency })}
            name="amount"
            register={form.register}
          />
          <FormFieldDate
            error={form.formState.errors.receivedAt?.message}
            label={t("RECEIVED_AT")}
            name="receivedAt"
            register={form.register}
          />
          <FormFieldText label={t("RECEIPT_METHOD")} name="method" register={form.register} />
          <FormFieldText label={t("BANK_REF")} name="bankRef" register={form.register} />
          <div className="sm:col-span-2">
            <FormFieldTextarea label={t("NOTE")} name="note" register={form.register} rows={2} />
          </div>
        </div>
      )}
    </FormDialog>
  );
}

export function CollectionDialog({ receivable, onClose }: ArProps) {
  const { t, i18n } = useTranslation("receivable");
  const log = useCollectionLogMutation();
  const channelLabel = useDictLabel("collectionChannel");
  const schema = useMemo(
    () =>
      z.object({
        channel: z.enum(COLLECTION_CHANNELS),
        result: z.enum(COLLECTION_RESULTS),
        nextFollowUp: z.string(),
        note: z.string().max(1000),
      }),
    [],
  );
  if (!receivable) return null;
  return (
    <FormDialog
      defaultValues={{ channel: "EMAIL" as const, result: "PROMISED" as const, nextFollowUp: "", note: "" }}
      description={t("COLLECTION_DESC")}
      open
      schema={schema}
      title={t("COLLECTION_TITLE", { no: receivable.docNo })}
      onOpenChange={(open) => !open && onClose()}
      onSubmit={(values) =>
        log.mutateAsync({
          id: receivable.id,
          input: {
            channel: values.channel,
            result: values.result,
            nextFollowUp: values.nextFollowUp || null,
            note: values.note || null,
          },
        })
      }
    >
      {(form) => (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <ArSummary ar={receivable} />
          </div>
          <FormFieldSelect
            label={t("CHANNEL")}
            name="channel"
            options={COLLECTION_CHANNELS.map((c) => ({ value: c, label: channelLabel(c) }))}
            register={form.register}
          />
          <FormFieldSelect
            label={t("COLLECTION_RESULT")}
            name="result"
            options={COLLECTION_RESULTS.map((r) => ({ value: r, label: resultLabel(r, i18n.language) }))}
            register={form.register}
          />
          <FormFieldDate label={t("NEXT_FOLLOW_UP")} name="nextFollowUp" register={form.register} />
          <div className="sm:col-span-2">
            <FormFieldTextarea label={t("NOTE")} name="note" register={form.register} rows={3} />
          </div>
        </div>
      )}
    </FormDialog>
  );
}

export function OffsetDialog({ receivable, onClose }: ArProps) {
  const { t } = useTranslation("receivable");
  const offset = useOffsetMutation();
  const targets = useReceivablesQuery(
    { customerId: receivable?.customerId, status: "NOT_DUE,DUE,PARTIAL", pageSize: 100 },
    Boolean(receivable),
  );
  const options = (targets.data?.items ?? []).filter(
    (r) => r.currency === receivable?.currency && r.amount > 0 && r.outstanding >= Math.abs(receivable?.amount ?? 0),
  );
  const schema = useMemo(
    () => z.object({ targetId: z.string().min(1, t("TARGET_REQUIRED")), note: z.string().max(500) }),
    [t],
  );
  if (!receivable) return null;
  return (
    <FormDialog
      defaultValues={{ targetId: "", note: "" }}
      description={t("OFFSET_DESC")}
      open
      schema={schema}
      submitLabel={t("OFFSET")}
      title={t("OFFSET_TITLE", { no: receivable.docNo })}
      onOpenChange={(open) => !open && onClose()}
      onSubmit={(values) =>
        offset.mutateAsync({
          id: receivable.id,
          input: { version: receivable.version, targetId: values.targetId, note: values.note || null },
        })
      }
    >
      {(form) => (
        <div className="grid gap-4">
          <ArSummary ar={receivable} />
          <FormFieldSelect
            error={form.formState.errors.targetId?.message}
            label={t("OFFSET_TARGET")}
            name="targetId"
            options={[
              { value: "", label: options.length ? "—" : t("OFFSET_NO_TARGET") },
              ...options.map((r) => ({
                value: r.id,
                label: `${r.docNo} · ${r.currency} ${r.outstanding.toFixed(2)} · ${r.dueDate}`,
              })),
            ]}
            register={form.register}
          />
          <FormFieldTextarea label={t("NOTE")} name="note" register={form.register} rows={2} />
        </div>
      )}
    </FormDialog>
  );
}

type CreateProps = { open: boolean; onOpenChange: (open: boolean) => void };

export function ReceivableCreateDialog({ open, onOpenChange }: CreateProps) {
  const { t } = useTranslation("receivable");
  const lookups = useLookups();
  const typeLabel = useDictLabel("receivableType");
  const create = useCreateReceivableMutation();
  const schema = useMemo(
    () =>
      z
        .object({
          orderId: z.string(),
          customerId: z.string(),
          type: z.enum(RECEIVABLE_TYPES),
          amount: z.string().regex(AMOUNT, t("AMOUNT_INVALID")),
          currency: z.string(),
          dueDate: z.string(),
          settlementEntity: z.string().max(160),
          sourceNo: z.string().max(60),
          note: z.string().max(500),
        })
        .refine((v) => v.orderId || v.customerId, { path: ["customerId"], message: t("CUSTOMER_REQUIRED") })
        .refine((v) => (v.type === "DEDUCTION") === Number(v.amount) < 0 && Number(v.amount) !== 0, {
          path: ["amount"],
          message: t("AMOUNT_SIGN"),
        }),
    [t],
  );
  return (
    <FormDialog
      defaultValues={{
        orderId: "",
        customerId: "",
        type: "FREIGHT" as const,
        amount: "",
        currency: "",
        dueDate: "",
        settlementEntity: "",
        sourceNo: "",
        note: "",
      }}
      description={t("CREATE_DESC")}
      open={open}
      schema={schema}
      title={t("CREATE_TITLE")}
      width="md"
      onOpenChange={onOpenChange}
      onSubmit={(values) =>
        create.mutateAsync({
          ...(values.orderId ? { orderId: values.orderId } : { customerId: values.customerId }),
          type: values.type,
          amount: Number(values.amount),
          ...(values.currency ? { currency: values.currency } : {}),
          dueDate: values.dueDate || null,
          settlementEntity: values.settlementEntity || null,
          sourceNo: values.sourceNo || null,
          note: values.note || null,
        })
      }
    >
      {(form) => (
        <div className="grid gap-4 sm:grid-cols-2">
          <Controller
            control={form.control}
            name="orderId"
            render={({ field }) => <OrderPicker value={field.value} onChange={field.onChange} />}
          />
          <FormFieldSelect
            error={form.formState.errors.customerId?.message}
            label={t("CUSTOMER_NO_ORDER")}
            name="customerId"
            options={[
              { value: "", label: "—" },
              ...(lookups.data?.customers ?? []).map((c) => ({ value: c.id, label: c.name })),
            ]}
            register={form.register}
          />
          <FormFieldSelect
            label={t("TYPE")}
            name="type"
            options={RECEIVABLE_TYPES.map((r) => ({ value: r, label: typeLabel(r) }))}
            register={form.register}
          />
          <FormFieldText
            error={form.formState.errors.amount?.message}
            inputMode="decimal"
            label={t("AMOUNT")}
            name="amount"
            register={form.register}
          />
          <FormFieldSelect
            label={t("CURRENCY")}
            name="currency"
            options={[
              { value: "", label: t("CURRENCY_DEFAULT") },
              ...(lookups.data?.currencies ?? []).map((c) => ({ value: c, label: c })),
            ]}
            register={form.register}
          />
          <FormFieldDate label={t("DUE_DATE")} name="dueDate" register={form.register} />
          <FormFieldText label={t("SETTLEMENT_ENTITY")} name="settlementEntity" register={form.register} />
          <FormFieldText label={t("SOURCE_NO")} name="sourceNo" register={form.register} />
          <div className="sm:col-span-2">
            <FormFieldTextarea label={t("NOTE")} name="note" register={form.register} rows={2} />
          </div>
        </div>
      )}
    </FormDialog>
  );
}

export function InvoiceDialog({ open, onOpenChange }: CreateProps) {
  const { t } = useTranslation("receivable");
  const create = useCreateInvoiceMutation();
  const candidates = useReceivablesQuery({ type: "GOODS", status: "NOT_DUE,DUE,PARTIAL", pageSize: 100 }, open);
  const list = (candidates.data?.items ?? []).filter((r) => !r.invoiceId && isOpen(r));
  const schema = useMemo(
    () =>
      z.object({
        invoiceNo: z.string().trim().min(1, t("INVOICE_REQUIRED")).max(60),
        receivableId: z.string().min(1, t("TARGET_REQUIRED")),
        amount: z.string().regex(POSITIVE, t("AMOUNT_INVALID")),
        issuedDate: z.string().min(1, t("DATE_REQUIRED")),
        note: z.string().max(500),
      }),
    [t],
  );
  return (
    <FormDialog
      defaultValues={{ invoiceNo: "", receivableId: "", amount: "", issuedDate: today(), note: "" }}
      description={t("INVOICE_DESC")}
      open={open}
      schema={schema}
      title={t("INVOICE_NEW")}
      onOpenChange={onOpenChange}
      onSubmit={(values) =>
        create.mutateAsync({
          invoiceNo: values.invoiceNo,
          receivableId: values.receivableId,
          amount: Number(values.amount),
          issuedDate: values.issuedDate,
          note: values.note || null,
        })
      }
    >
      {(form) => (
        <div className="grid gap-4 sm:grid-cols-2">
          <FormFieldText
            error={form.formState.errors.invoiceNo?.message}
            label={t("INVOICE_NO")}
            name="invoiceNo"
            register={form.register}
          />
          <FormFieldDate
            error={form.formState.errors.issuedDate?.message}
            label={t("ISSUED_DATE")}
            name="issuedDate"
            register={form.register}
          />
          <div className="sm:col-span-2">
            <Controller
              control={form.control}
              name="receivableId"
              render={({ field, fieldState }) => (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium" htmlFor="invoice-ar">
                    {t("INVOICE_AR")}
                  </label>
                  <select
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                    id="invoice-ar"
                    value={field.value}
                    onChange={(event) => {
                      field.onChange(event.target.value);
                      const ar = list.find((r) => r.id === event.target.value);
                      if (ar) form.setValue("amount", String(ar.amount));
                    }}
                  >
                    <option value="">—</option>
                    {list.map((r) => (
                      <option key={r.id} value={r.id}>
                        {`${r.docNo} · ${r.customerName} · ${r.shipmentNo ?? r.sourceNo ?? ""} · ${r.currency} ${r.amount.toFixed(2)}`}
                      </option>
                    ))}
                  </select>
                  {fieldState.error ? (
                    <p className="text-sm font-medium text-destructive" role="alert">
                      {fieldState.error.message}
                    </p>
                  ) : null}
                </div>
              )}
            />
          </div>
          <FormFieldText
            error={form.formState.errors.amount?.message}
            inputMode="decimal"
            label={t("INVOICE_AMOUNT")}
            name="amount"
            register={form.register}
          />
          <div className="sm:col-span-2">
            <FormFieldTextarea label={t("NOTE")} name="note" register={form.register} rows={2} />
          </div>
        </div>
      )}
    </FormDialog>
  );
}
