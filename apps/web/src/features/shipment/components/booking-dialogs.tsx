import { TRANSPORT_MODES } from "@otd/contracts/shipment";
import { useMemo } from "react";
import { Controller } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import { FieldGrid } from "@/components/biz/field-grid";
import { FormDialog } from "@/components/biz/form-dialog";
import { StatusBadge } from "@/components/biz/status-badge";
import { LoadingState } from "@/components/common/loading-state";
import { FormFieldDate } from "@/components/form/form-field-date";
import { FormFieldSelect } from "@/components/form/form-field-select";
import { FormFieldText } from "@/components/form/form-field-text";
import { FormFieldTextarea } from "@/components/form/form-field-textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { OrderPicker } from "@/features/inspection/components/order-picker";
import { useLookups } from "@/features/masterdata/lookups.queries";
import { formatDate } from "@/lib/date";

import { useTransportLabel } from "../shipment.labels";
import { useCancelBookingMutation, useConfirmBookingMutation, useSaveBookingMutation } from "../shipment.mutations";
import { useBookingQuery } from "../shipment.queries";

import type { BookingDto, TransportMode } from "@otd/contracts/shipment";

type FormProps = { open: boolean; booking: BookingDto | null; onOpenChange: (open: boolean) => void };

export function BookingFormDialog({ open, booking, onOpenChange }: FormProps) {
  const { t } = useTranslation("shipment");
  const lookups = useLookups();
  const transportLabel = useTransportLabel();
  const save = useSaveBookingMutation();
  const schema = useMemo(
    () =>
      z.object({
        orderId: booking ? z.string() : z.string().min(1, t("ORDER_REQUIRED")),
        forwarderId: z.string(),
        carrier: z.string().max(80),
        vessel: z.string().max(80),
        voyage: z.string().max(40),
        blNo: z.string().max(60),
        transportMode: z.string(),
        cutoffDate: z.string(),
        containerType: z.string().max(40),
        etd: z.string(),
        eta: z.string(),
        note: z.string().max(500),
      }),
    [booking, t],
  );
  const forwarders = (lookups.data?.forwarders ?? []).filter((f) => f.type === "FORWARDER");
  const carriers = (lookups.data?.forwarders ?? []).filter((f) => f.type === "CARRIER");
  return (
    <FormDialog
      defaultValues={{
        orderId: booking?.orderId ?? "",
        forwarderId: booking?.forwarderId ?? "",
        carrier: booking?.carrier ?? "",
        vessel: booking?.vessel ?? "",
        voyage: booking?.voyage ?? "",
        blNo: booking?.blNo ?? "",
        transportMode: booking?.transportMode ?? "",
        cutoffDate: booking?.cutoffDate ?? "",
        containerType: booking?.containerType ?? "",
        etd: booking?.etd ?? "",
        eta: booking?.eta ?? "",
        note: booking?.note ?? "",
      }}
      key={booking?.id ?? "new"}
      open={open}
      schema={schema}
      title={booking ? t("BOOKING_EDIT", { no: booking.docNo }) : t("BOOKING_NEW")}
      width="md"
      onOpenChange={onOpenChange}
      onSubmit={(values) => {
        const fields = {
          forwarderId: values.forwarderId || null,
          carrier: values.carrier || null,
          vessel: values.vessel || null,
          voyage: values.voyage || null,
          blNo: values.blNo || null,
          transportMode: (values.transportMode || null) as TransportMode | null,
          cutoffDate: values.cutoffDate || null,
          containerType: values.containerType || null,
          etd: values.etd || null,
          eta: values.eta || null,
          note: values.note || null,
        };
        return booking
          ? save.mutateAsync({ id: booking.id, input: { ...fields, version: booking.version } })
          : save.mutateAsync({ input: { ...fields, orderId: values.orderId } });
      }}
    >
      {(form) => (
        <div className="grid gap-4 sm:grid-cols-2">
          {booking ? null : (
            <Controller
              control={form.control}
              name="orderId"
              render={({ field, fieldState }) => (
                <OrderPicker error={fieldState.error?.message} value={field.value} onChange={field.onChange} />
              )}
            />
          )}
          <FormFieldSelect
            label={t("FORWARDER")}
            name="forwarderId"
            options={[{ value: "", label: "—" }, ...forwarders.map((f) => ({ value: f.id, label: f.name }))]}
            register={form.register}
          />
          <FormFieldText label={t("CARRIER")} list="otd-carriers" name="carrier" register={form.register} />
          <datalist id="otd-carriers">
            {carriers.map((c) => (
              <option key={c.id} value={c.name} />
            ))}
          </datalist>
          <FormFieldSelect
            label={t("TRANSPORT")}
            name="transportMode"
            options={[
              { value: "", label: t("FROM_ORDER") },
              ...TRANSPORT_MODES.map((m) => ({ value: m, label: transportLabel(m) })),
            ]}
            register={form.register}
          />
          <FormFieldText label={t("VESSEL")} name="vessel" register={form.register} />
          <FormFieldText label={t("VOYAGE")} name="voyage" register={form.register} />
          <FormFieldText label={t("BL_NO")} name="blNo" register={form.register} />
          <FormFieldText label={t("CONTAINER")} name="containerType" placeholder="40HQ" register={form.register} />
          <FormFieldDate label={t("CUTOFF")} name="cutoffDate" register={form.register} />
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

type ActionProps = { booking: BookingDto | null; onClose: () => void };

export function BookingConfirmDialog({ booking, onClose }: ActionProps) {
  const { t } = useTranslation("shipment");
  const confirm = useConfirmBookingMutation();
  const schema = useMemo(
    () =>
      z.object({
        vessel: z.string().max(80),
        voyage: z.string().max(40),
        blNo: z.string().max(60),
        etd: z.string(),
        eta: z.string(),
        note: z.string().max(500),
      }),
    [],
  );
  if (!booking) return null;
  return (
    <FormDialog
      defaultValues={{
        vessel: booking.vessel ?? "",
        voyage: booking.voyage ?? "",
        blNo: booking.blNo ?? "",
        etd: booking.etd ?? "",
        eta: booking.eta ?? "",
        note: "",
      }}
      description={t("CONFIRM_DESC")}
      open
      schema={schema}
      submitLabel={t("CONFIRM")}
      title={t("CONFIRM_TITLE", { no: booking.docNo })}
      onOpenChange={(open) => !open && onClose()}
      onSubmit={(values) =>
        confirm.mutateAsync({
          id: booking.id,
          input: {
            version: booking.version,
            ...(values.vessel ? { vessel: values.vessel } : {}),
            ...(values.voyage ? { voyage: values.voyage } : {}),
            ...(values.blNo ? { blNo: values.blNo } : {}),
            ...(values.etd ? { etd: values.etd } : {}),
            ...(values.eta ? { eta: values.eta } : {}),
            note: values.note || null,
          },
        })
      }
    >
      {(form) => (
        <div className="grid gap-4 sm:grid-cols-2">
          <FormFieldText label={t("VESSEL")} name="vessel" register={form.register} />
          <FormFieldText label={t("VOYAGE")} name="voyage" register={form.register} />
          <FormFieldText label={t("BL_NO")} name="blNo" register={form.register} />
          <span />
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

export function BookingCancelDialog({ booking, onClose }: ActionProps) {
  const { t } = useTranslation("shipment");
  const cancel = useCancelBookingMutation();
  const schema = useMemo(() => z.object({ reason: z.string().trim().min(1, t("REASON_REQUIRED")).max(500) }), [t]);
  if (!booking) return null;
  return (
    <FormDialog
      defaultValues={{ reason: "" }}
      open
      schema={schema}
      submitLabel={t("CANCEL_BOOKING")}
      title={t("CANCEL_TITLE", { no: booking.docNo })}
      onOpenChange={(open) => !open && onClose()}
      onSubmit={(values) =>
        cancel.mutateAsync({ id: booking.id, input: { version: booking.version, reason: values.reason } })
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

export function BookingViewDialog({ bookingId, onClose }: { bookingId: string | null; onClose: () => void }) {
  const { t } = useTranslation("shipment");
  const transportLabel = useTransportLabel();
  const booking = useBookingQuery(bookingId);
  const b = booking.data;
  return (
    <Dialog open={Boolean(bookingId)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[720px]">
        <DialogHeader>
          <DialogTitle>{b ? t("BOOKING_VIEW", { no: b.docNo }) : t("BOOKING_NO")}</DialogTitle>
        </DialogHeader>
        {!b ? (
          <LoadingState />
        ) : (
          <FieldGrid
            columns={3}
            items={[
              { label: t("BOOKING_NO"), value: <span className="tabular">{b.docNo}</span> },
              { label: t("STATUS"), value: <StatusBadge code={b.status} machine="booking" /> },
              { label: t("PO"), value: b.poNo },
              { label: t("FORWARDER"), value: b.forwarderName },
              { label: t("CARRIER"), value: b.carrier },
              { label: t("TRANSPORT"), value: transportLabel(b.transportMode) },
              { label: t("VESSEL_VOYAGE"), value: [b.vessel, b.voyage].filter(Boolean).join(" / ") },
              { label: t("BL_NO"), value: b.blNo },
              { label: t("CONTAINER"), value: b.containerType },
              { label: t("CUTOFF"), value: formatDate(b.cutoffDate) },
              { label: "ETD", value: formatDate(b.etd) },
              { label: "ETA", value: formatDate(b.eta) },
              { label: t("CONFIRMED_AT"), value: formatDate(b.confirmedAt, true) },
              { label: t("SHIPMENT_COUNT"), value: String(b.shipmentCount) },
              { label: t("NOTE"), value: b.note, span: "full" },
            ]}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
