import { pickLabel } from "@otd/shared";
import { useMemo } from "react";
import { useWatch, type UseFormReturn } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import { FormDialog } from "@/components/biz/form-dialog";
import { FormFieldDate } from "@/components/form/form-field-date";
import { FormFieldSelect } from "@/components/form/form-field-select";
import { FormFieldText } from "@/components/form/form-field-text";
import { FormFieldTextarea } from "@/components/form/form-field-textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { dictionaryOptions, useLookups } from "@/features/masterdata/lookups.queries";

import {
  useCreateOrderMutation,
  useReviseOrderMutation,
  useUpdateOrderMutation,
  type OrderCreateInput,
  type OrderReviseInput,
  type OrderUpdateInput,
} from "../order.mutations";

import { EMPTY_LINE, toLineInputs, type LineValues, type OrderFormValues } from "./order-form.types";
import { OrderLinesEditor } from "./order-lines-editor";

import type { OrderDetail } from "../order.types";
import type { Lookups } from "@otd/contracts/masterdata";

const lineSchema = z.object({
  styleId: z.string().min(1, "LINE_STYLE_REQUIRED"),
  styleNo: z.string(),
  hint: z.string(),
  color: z.string(),
  size: z.string(),
  sku: z.string(),
  quantity: z.string().refine((v) => Number.isInteger(Number(v)) && Number(v) >= 1, "LINE_QTY_RULE"),
  unitPrice: z.string().refine((v) => v === "" || (!Number.isNaN(Number(v)) && Number(v) >= 0), "LINE_PRICE_RULE"),
});

const TEXT_KEYS = [
  "channel",
  "poType",
  "productLine",
  "seasonCode",
  "styleType",
  "tradeTerm",
  "paymentTerms",
  "buyerEntity",
  "origin",
  "orderDate",
  "factoryEntity",
  "transportMode",
  "destination",
  "poTerms",
  "note",
] as const;

function orderDefaults(order: OrderDetail): OrderFormValues {
  return {
    customerId: order.customerId,
    poNo: order.poNo,
    customerDueDate: order.customerDueDate ?? "",
    channel: order.channel ?? "",
    poType: order.poType ?? "",
    productLine: order.productLine ?? "",
    seasonCode: order.seasonCode ?? "",
    styleType: order.styleType ?? "",
    tradeTerm: order.tradeTerm ?? "",
    paymentTerms: order.paymentTerms ?? "",
    currency: order.currency ?? "USD",
    buyerEntity: order.buyerEntity ?? "",
    origin: order.origin ?? "",
    orderDate: order.orderDate ?? "",
    factoryId: order.factoryId ?? "",
    factoryEntity: order.factoryEntity ?? "",
    transportMode: order.transportMode ?? "",
    destination: order.destination ?? "",
    totalUnits: order.totalUnits === null ? "" : String(order.totalUnits),
    merchandiserId: order.merchandiserId ?? "",
    poTerms: order.poTerms ?? "",
    note: order.note ?? "",
    lines: [
      ...order.lines.map((l) => ({
        styleId: l.styleId,
        styleNo: l.styleNo,
        hint: "",
        color: l.color ?? "",
        size: l.size ?? "",
        sku: l.sku ?? "",
        quantity: String(l.quantity),
        unitPrice: l.unitPrice === null ? "" : String(l.unitPrice),
      })),
      ...order.unmatchedLines.map((l) => ({
        styleId: "",
        styleNo: l.styleNo,
        hint: l.styleNo,
        color: l.color ?? "",
        size: l.size ?? "",
        sku: l.sku ?? "",
        quantity: String(l.quantity),
        unitPrice: l.unitPrice === null ? "" : String(l.unitPrice),
      })),
    ],
  };
}

function linesSignature(
  lines: { styleId: string; color: string; size: string; sku: string; quantity: string; unitPrice: string }[],
): string {
  return lines.map((l) => `${l.styleId}|${l.color}|${l.size}|${l.sku}|${l.quantity}|${l.unitPrice}`).join(";");
}

function currentLinesSignature(order: OrderDetail): string {
  return linesSignature([
    ...order.lines.map((l) => ({
      styleId: l.styleId,
      color: l.color ?? "",
      size: l.size ?? "",
      sku: l.sku ?? "",
      quantity: String(l.quantity),
      unitPrice: l.unitPrice === null ? "" : String(l.unitPrice),
    })),
    ...order.unmatchedLines.map((l) => ({
      styleId: "",
      color: l.color ?? "",
      size: l.size ?? "",
      sku: l.sku ?? "",
      quantity: String(l.quantity),
      unitPrice: l.unitPrice === null ? "" : String(l.unitPrice),
    })),
  ]);
}

function buildPatch(values: OrderFormValues, order: OrderDetail, allowKey: boolean): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const key of TEXT_KEYS) {
    if (values[key] !== (order[key] ?? "")) patch[key] = values[key] || null;
  }
  if (values.factoryId !== (order.factoryId ?? "")) patch.factoryId = values.factoryId || null;
  if (values.merchandiserId !== (order.merchandiserId ?? "")) patch.merchandiserId = values.merchandiserId || null;
  if (values.totalUnits !== (order.totalUnits === null ? "" : String(order.totalUnits))) {
    patch.totalUnits = values.totalUnits === "" ? null : Number(values.totalUnits);
  }
  if (allowKey) {
    if (values.customerDueDate !== (order.customerDueDate ?? ""))
      patch.customerDueDate = values.customerDueDate || null;
    if (values.currency !== order.currency) patch.currency = values.currency;
    if (linesSignature(values.lines) !== currentLinesSignature(order)) patch.lines = toLineInputs(values.lines);
  }
  return patch;
}

function option(
  list: { value: string; label: string }[],
  value: string,
  fallback: string,
): { value: string; label: string }[] {
  return list.some((o) => o.value === value) || !value ? list : [...list, { value, label: fallback }];
}

type GridProps = {
  form: UseFormReturn<OrderFormValues>;
  lookups: Lookups | undefined;
  allowKey: boolean;
  showKeyFields: boolean;
};

function OrderFieldsGrid({ form, lookups, allowKey, showKeyFields }: GridProps) {
  const { t, i18n } = useTranslation("order");
  const lang = i18n.language;
  const customerId = useWatch({ control: form.control, name: "customerId" });
  const currency = useWatch({ control: form.control, name: "currency" }) || "USD";
  const errors = form.formState.errors;
  const factories = (lookups?.factories ?? []).map((f) => ({ value: f.id, label: f.name }));
  const merchandisers = (lookups?.users ?? []).map((u) => ({ value: u.id, label: u.name }));
  const seasons = (lookups?.seasons ?? []).map((s) => ({ value: s.code, label: pickLabel(s.label, lang) }));
  const transports = dictionaryOptions(lookups, "transportMode", lang);
  const factoryId = form.getValues("factoryId");
  const merchandiserId = form.getValues("merchandiserId");
  const transportMode = form.getValues("transportMode");

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {showKeyFields ? (
        <>
          <FormFieldDate
            error={errors.customerDueDate?.message}
            label={t("CREATE_DUE")}
            name="customerDueDate"
            register={form.register}
          />
          <FormFieldSelect
            error={errors.currency?.message}
            label={t("F_CURRENCY")}
            name="currency"
            options={(lookups?.currencies ?? ["USD"]).map((c) => ({ value: c, label: c }))}
            register={form.register}
          />
          <FormFieldText label={t("F_TRADE_TERM")} name="tradeTerm" register={form.register} />
          <FormFieldText label={t("F_PAYMENT")} name="paymentTerms" register={form.register} />
        </>
      ) : null}
      <FormFieldDate label={t("F_ORDER_DATE")} name="orderDate" register={form.register} />
      <FormFieldSelect
        label={t("F_SEASON")}
        name="seasonCode"
        options={option(seasons, form.getValues("seasonCode"), form.getValues("seasonCode"))}
        register={form.register}
      />
      <FormFieldText label={t("F_CHANNEL")} name="channel" register={form.register} />
      <FormFieldText label={t("F_PO_TYPE")} name="poType" register={form.register} />
      <FormFieldText label={t("F_PRODUCT_LINE")} name="productLine" register={form.register} />
      <FormFieldText label={t("F_STYLE_TYPE")} name="styleType" register={form.register} />
      <FormFieldText label={t("F_BUYER")} name="buyerEntity" register={form.register} />
      <FormFieldText label={t("F_ORIGIN")} name="origin" register={form.register} />
      <FormFieldSelect
        label={t("F_FACTORY")}
        name="factoryId"
        options={
          option(factories, factoryId, factoryId).length
            ? [{ value: "", label: t("PICK_NONE") }, ...option(factories, factoryId, factoryId)]
            : [{ value: "", label: t("PICK_NONE") }]
        }
        register={form.register}
      />
      <FormFieldSelect
        label={t("F_MERCH")}
        name="merchandiserId"
        options={[{ value: "", label: t("PICK_NONE") }, ...option(merchandisers, merchandiserId, merchandiserId)]}
        register={form.register}
      />
      <FormFieldSelect
        label={t("F_TRANSPORT")}
        name="transportMode"
        options={[{ value: "", label: t("PICK_NONE") }, ...option(transports, transportMode, transportMode)]}
        register={form.register}
      />
      <FormFieldText label={t("F_DESTINATION")} name="destination" register={form.register} />
      <FormFieldText
        error={errors.totalUnits?.message}
        inputMode="numeric"
        label={t("F_UNITS")}
        name="totalUnits"
        register={form.register}
      />
      <FormFieldText label={t("F_FACTORY_ENTITY")} name="factoryEntity" register={form.register} />
      {showKeyFields ? (
        <div className="sm:col-span-2">
          <p className="mb-2 text-sm font-medium">{t("LINES_TITLE")}</p>
          <OrderLinesEditor
            control={form.control}
            currency={currency}
            customerId={customerId}
            errors={errors}
            register={form.register}
          />
        </div>
      ) : null}
      <div className="sm:col-span-2">
        <FormFieldTextarea label={t("F_TERMS")} name="poTerms" register={form.register} rows={2} />
      </div>
      <div className="sm:col-span-2">
        <FormFieldTextarea label={t("NOTE_OPTIONAL")} name="note" register={form.register} rows={2} />
      </div>
      {allowKey ? null : (
        <div className="sm:col-span-2">
          <Alert>
            <AlertDescription>{t("EDIT_KEY_LOCKED")}</AlertDescription>
          </Alert>
        </div>
      )}
    </div>
  );
}

type CreateProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (order: OrderDetail) => void;
};

export function CreateOrderDialog({ open, onOpenChange, onCreated }: CreateProps) {
  const { t, i18n } = useTranslation("order");
  const lookups = useLookups();
  const create = useCreateOrderMutation();
  const lang = i18n.language;

  const schema = useMemo(
    () =>
      z.object({
        customerId: z.string().min(1, t("REQUIRED")),
        poNo: z.string().trim().min(1, t("PO_RULE")).max(40),
        customerDueDate: z.string().min(1, t("REQUIRED")),
        channel: z.string(),
        poType: z.string(),
        productLine: z.string(),
        seasonCode: z.string(),
        styleType: z.string(),
        tradeTerm: z.string(),
        paymentTerms: z.string(),
        currency: z.string().min(3).max(3),
        buyerEntity: z.string(),
        origin: z.string(),
        orderDate: z.string(),
        factoryId: z.string(),
        factoryEntity: z.string(),
        transportMode: z.string(),
        destination: z.string(),
        totalUnits: z
          .string()
          .refine((v) => v === "" || (Number.isInteger(Number(v)) && Number(v) >= 0), t("QTY_TOTAL_RULE")),
        merchandiserId: z.string(),
        poTerms: z.string(),
        note: z.string(),
        lines: z.array(lineSchema).min(1),
      }) as unknown as z.ZodType<OrderFormValues>,
    [t],
  );

  const defaults = useMemo<OrderFormValues>(
    () => ({
      customerId: "",
      poNo: "",
      customerDueDate: "",
      channel: "",
      poType: "",
      productLine: "",
      seasonCode: "",
      styleType: "",
      tradeTerm: "",
      paymentTerms: "",
      currency: "USD",
      buyerEntity: "",
      origin: "",
      orderDate: "",
      factoryId: "",
      factoryEntity: "",
      transportMode: "",
      destination: "",
      totalUnits: "",
      merchandiserId: "",
      poTerms: "",
      note: "",
      lines: [{ ...EMPTY_LINE }],
    }),
    [],
  );

  return (
    <FormDialog
      defaultValues={defaults}
      description={t("CREATE_DESC")}
      open={open}
      schema={schema}
      submitLabel={t("CREATE_TITLE")}
      title={t("CREATE_TITLE")}
      width="lg"
      onOpenChange={onOpenChange}
      onSubmit={async (values) => {
        const input: OrderCreateInput = {
          customerId: values.customerId,
          poNo: values.poNo,
          customerDueDate: values.customerDueDate,
          currency: values.currency,
          lines: toLineInputs(values.lines),
        };
        for (const key of TEXT_KEYS) {
          if (values[key]) (input as Record<string, unknown>)[key] = values[key];
        }
        if (values.factoryId) input.factoryId = values.factoryId;
        if (values.merchandiserId) input.merchandiserId = values.merchandiserId;
        if (values.transportMode) input.transportMode = values.transportMode;
        if (values.totalUnits !== "") input.totalUnits = Number(values.totalUnits);
        const created = await create.mutateAsync(input);
        onCreated?.(created);
        return created;
      }}
    >
      {(form) => (
        <div className="grid gap-4 sm:grid-cols-2">
          <FormFieldSelect
            error={form.formState.errors.customerId?.message}
            label={t("F_CUSTOMER")}
            name="customerId"
            options={[
              { value: "", label: t("PICK_CUSTOMER") },
              ...(lookups.data?.customers ?? []).map((c) => ({
                value: c.id,
                label: pickLabel({ zh: c.name, en: c.nameEn ?? c.name }, lang),
              })),
            ]}
            register={form.register}
          />
          <FormFieldText
            error={form.formState.errors.poNo?.message}
            label={t("CREATE_PO")}
            name="poNo"
            register={form.register}
          />
          <OrderFieldsGrid allowKey form={form} lookups={lookups.data} showKeyFields />
        </div>
      )}
    </FormDialog>
  );
}

type DialogProps = { order: OrderDetail; open: boolean; onOpenChange: (open: boolean) => void };

export function EditOrderDialog({ order, open, onOpenChange }: DialogProps) {
  const { t } = useTranslation("order");
  const lookups = useLookups();
  const update = useUpdateOrderMutation();
  const allowKey = order.status === "PENDING_CONFIRM";

  const schema = useMemo(
    () =>
      z.object({
        customerId: z.string(),
        poNo: z.string(),
        customerDueDate: allowKey ? z.string().min(1, t("REQUIRED")) : z.string(),
        channel: z.string(),
        poType: z.string(),
        productLine: z.string(),
        seasonCode: z.string(),
        styleType: z.string(),
        tradeTerm: z.string(),
        paymentTerms: z.string(),
        currency: z.string().min(3).max(3),
        buyerEntity: z.string(),
        origin: z.string(),
        orderDate: z.string(),
        factoryId: z.string(),
        factoryEntity: z.string(),
        transportMode: z.string(),
        destination: z.string(),
        totalUnits: z
          .string()
          .refine((v) => v === "" || (Number.isInteger(Number(v)) && Number(v) >= 0), t("QTY_TOTAL_RULE")),
        merchandiserId: z.string(),
        poTerms: z.string(),
        note: z.string(),
        lines: allowKey ? z.array(lineSchema).min(1) : z.array(z.unknown() as never),
      }) as unknown as z.ZodType<OrderFormValues>,
    [allowKey, t],
  );

  const defaults = useMemo(() => orderDefaults(order), [order]);

  return (
    <FormDialog
      defaultValues={defaults}
      description={t("EDIT_DESC")}
      open={open}
      schema={schema}
      title={t("EDIT_TITLE", { po: order.poNo })}
      width="lg"
      onOpenChange={onOpenChange}
      onSubmit={async (values) => {
        const patch = buildPatch(values, order, allowKey) as OrderUpdateInput;
        return update.mutateAsync({ id: order.id, version: order.version, input: patch });
      }}
    >
      {(form) => <OrderFieldsGrid allowKey={allowKey} form={form} lookups={lookups.data} showKeyFields={allowKey} />}
    </FormDialog>
  );
}

export function ReviseOrderDialog({ order, open, onOpenChange }: DialogProps) {
  const { t } = useTranslation("order");
  const lookups = useLookups();
  const revise = useReviseOrderMutation();

  const schema = useMemo(
    () =>
      z.object({
        customerId: z.string(),
        poNo: z.string(),
        customerDueDate: z.string().min(1, t("REQUIRED")),
        channel: z.string(),
        poType: z.string(),
        productLine: z.string(),
        seasonCode: z.string(),
        styleType: z.string(),
        tradeTerm: z.string(),
        paymentTerms: z.string(),
        currency: z.string().min(3).max(3),
        buyerEntity: z.string(),
        origin: z.string(),
        orderDate: z.string(),
        factoryId: z.string(),
        factoryEntity: z.string(),
        transportMode: z.string(),
        destination: z.string(),
        totalUnits: z
          .string()
          .refine((v) => v === "" || (Number.isInteger(Number(v)) && Number(v) >= 0), t("QTY_TOTAL_RULE")),
        merchandiserId: z.string(),
        poTerms: z.string(),
        note: z.string().trim().min(2, t("REVISE_NOTE_RULE")),
        lines: z.array(lineSchema).min(1),
      }) as unknown as z.ZodType<OrderFormValues>,
    [t],
  );

  const defaults = useMemo(() => orderDefaults(order), [order]);

  return (
    <FormDialog
      defaultValues={defaults}
      description={t("REVISE_DESC", { n: order.revision + 1 })}
      open={open}
      schema={schema}
      submitLabel={t("BTN_REVISE")}
      title={t("REVISE_TITLE", { po: order.poNo, n: order.revision + 1 })}
      width="lg"
      onOpenChange={onOpenChange}
      onSubmit={async (values) => {
        const patch = buildPatch(values, order, true) as OrderReviseInput;
        patch.note = values.note;
        return revise.mutateAsync({ id: order.id, version: order.version, input: patch });
      }}
    >
      {(form) => (
        <div className="space-y-4">
          <OrderFieldsGrid allowKey form={form} lookups={lookups.data} showKeyFields />
          <FormFieldTextarea
            error={form.formState.errors.note?.message}
            label={t("REVISE_NOTE")}
            name="note"
            register={form.register}
            rows={2}
          />
        </div>
      )}
    </FormDialog>
  );
}

export type { LineValues };
