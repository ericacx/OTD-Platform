import { TRANSPORT_MODES } from "@otd/contracts/shipment";
import { useMemo } from "react";
import { Controller } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import { FormDialog } from "@/components/biz/form-dialog";
import { FormFieldDate } from "@/components/form/form-field-date";
import { FormFieldSelect } from "@/components/form/form-field-select";
import { FormFieldText } from "@/components/form/form-field-text";
import { FormFieldTextarea } from "@/components/form/form-field-textarea";
import { Label } from "@/components/ui/label";
import { OrderPicker, StylePicker } from "@/features/inspection/components/order-picker";

import { useTransportLabel } from "../shipment.labels";
import { useCreateShipmentMutation } from "../shipment.mutations";
import { useBookingsQuery } from "../shipment.queries";

import type { ShipmentDto } from "@otd/contracts/shipment";

type Props = { open: boolean; onOpenChange: (open: boolean) => void; onCreated?: (row: ShipmentDto) => void };

const DECIMAL = /^(\d+(\.\d+)?)?$/;

function BookingSelect({
  orderId,
  value,
  onChange,
}: {
  orderId: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const { t } = useTranslation("shipment");
  const bookings = useBookingsQuery({ orderId, pageSize: 50 }, Boolean(orderId));
  return (
    <div className="space-y-1.5">
      <Label htmlFor="shipment-booking">{t("BOOKING_NO")}</Label>
      <select
        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
        disabled={!orderId}
        id="shipment-booking"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">{t("NO_BOOKING")}</option>
        {(bookings.data?.items ?? [])
          .filter((b) => b.status !== "CANCELLED")
          .map((b) => (
            <option key={b.id} value={b.id}>
              {`${b.docNo} · ${b.carrier ?? b.forwarderName ?? ""} · ETD ${b.etd ?? "—"}`}
            </option>
          ))}
      </select>
    </div>
  );
}

export function ShipmentCreateDialog({ open, onOpenChange, onCreated }: Props) {
  const { t } = useTranslation("shipment");
  const transportLabel = useTransportLabel();
  const create = useCreateShipmentMutation();
  const schema = useMemo(
    () =>
      z.object({
        orderId: z.string().min(1, t("ORDER_REQUIRED")),
        styleId: z.string(),
        bookingId: z.string(),
        transportMode: z.string(),
        destination: z.string().max(120),
        pairs: z.string().regex(/^[1-9]\d*$/, t("INT_INVALID")),
        cartonCount: z.string().regex(/^\d*$/, t("INT_INVALID")),
        grossWeight: z.string().regex(DECIMAL, t("NUMBER_INVALID")),
        etd: z.string(),
        eta: z.string(),
        note: z.string().max(500),
      }),
    [t],
  );
  return (
    <FormDialog
      defaultValues={{
        orderId: "",
        styleId: "",
        bookingId: "",
        transportMode: "",
        destination: "",
        pairs: "",
        cartonCount: "",
        grossWeight: "",
        etd: "",
        eta: "",
        note: "",
      }}
      description={t("CREATE_DESC")}
      open={open}
      schema={schema}
      title={t("CREATE_TITLE")}
      width="md"
      onOpenChange={onOpenChange}
      onSubmit={async (values) => {
        const row = await create.mutateAsync({
          orderId: values.orderId,
          styleId: values.styleId || null,
          bookingId: values.bookingId || null,
          transportMode: (values.transportMode || null) as (typeof TRANSPORT_MODES)[number] | null,
          destination: values.destination || null,
          pairs: Number(values.pairs),
          cartonCount: values.cartonCount ? Number(values.cartonCount) : null,
          grossWeight: values.grossWeight ? Number(values.grossWeight) : null,
          etd: values.etd || null,
          eta: values.eta || null,
          note: values.note || null,
        });
        onCreated?.(row);
      }}
    >
      {(form) => (
        <div className="grid gap-4 sm:grid-cols-2">
          <Controller
            control={form.control}
            name="orderId"
            render={({ field, fieldState }) => (
              <OrderPicker
                error={fieldState.error?.message}
                value={field.value}
                onChange={(id) => {
                  field.onChange(id);
                  form.setValue("styleId", "");
                  form.setValue("bookingId", "");
                }}
              />
            )}
          />
          <Controller
            control={form.control}
            name="styleId"
            render={({ field }) => (
              <StylePicker orderId={form.watch("orderId")} value={field.value} onChange={field.onChange} />
            )}
          />
          <Controller
            control={form.control}
            name="bookingId"
            render={({ field }) => (
              <BookingSelect orderId={form.watch("orderId")} value={field.value} onChange={field.onChange} />
            )}
          />
          <FormFieldSelect
            label={t("TRANSPORT")}
            name="transportMode"
            options={[
              { value: "", label: t("FROM_ORDER") },
              ...TRANSPORT_MODES.map((m) => ({ value: m, label: transportLabel(m) })),
            ]}
            register={form.register}
          />
          <FormFieldText
            label={t("DESTINATION")}
            name="destination"
            placeholder={t("FROM_ORDER")}
            register={form.register}
          />
          <FormFieldText
            error={form.formState.errors.pairs?.message}
            inputMode="numeric"
            label={t("PAIRS")}
            name="pairs"
            register={form.register}
          />
          <FormFieldText
            error={form.formState.errors.cartonCount?.message}
            inputMode="numeric"
            label={t("CARTONS")}
            name="cartonCount"
            placeholder={t("FROM_CARTONS")}
            register={form.register}
          />
          <FormFieldText
            error={form.formState.errors.grossWeight?.message}
            inputMode="decimal"
            label={t("GROSS_WEIGHT")}
            name="grossWeight"
            register={form.register}
          />
          <FormFieldDate label="ETD" name="etd" register={form.register} />
          <FormFieldDate label="ETA" name="eta" register={form.register} />
          <div className="sm:col-span-2">
            <FormFieldTextarea label={t("NOTE")} name="note" register={form.register} rows={2} />
          </div>
        </div>
      )}
    </FormDialog>
  );
}
