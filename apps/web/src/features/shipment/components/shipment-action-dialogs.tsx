import { pickLabel, statusLabel } from "@otd/shared";
import { useId, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import { FormDialog } from "@/components/biz/form-dialog";
import { FormFieldDate } from "@/components/form/form-field-date";
import { FormFieldText } from "@/components/form/form-field-text";
import { FormFieldTextarea } from "@/components/form/form-field-textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { nowLocal, toIsoDateTime } from "../shipment.labels";
import { useAdvanceShipmentMutation, useSignShipmentMutation } from "../shipment.mutations";

import type { ShipmentDto } from "@otd/contracts/shipment";
import type { UseFormRegisterReturn } from "react-hook-form";

const NEXT: Partial<Record<ShipmentDto["status"], "PACKED" | "SAILED" | "ARRIVED">> = {
  BOOKED: "PACKED",
  PACKED: "SAILED",
  SAILED: "ARRIVED",
};

export function nextAdvance(status: ShipmentDto["status"]) {
  return NEXT[status] ?? null;
}

type Props = { shipment: ShipmentDto | null; onClose: () => void };

function DateTimeField({
  label,
  error,
  registration,
}: {
  label: string;
  error?: string | undefined;
  registration: UseFormRegisterReturn;
}) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input aria-invalid={Boolean(error) || undefined} id={id} type="datetime-local" {...registration} />
      {error ? (
        <p className="text-sm font-medium text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function AdvanceDialog({ shipment, onClose }: Props) {
  const { t, i18n } = useTranslation("shipment");
  const advance = useAdvanceShipmentMutation();
  const schema = useMemo(
    () =>
      z.object({
        actualAt: z.string().min(1, t("DATE_REQUIRED")),
        blNo: z.string().max(60),
        eta: z.string(),
        note: z.string().max(500),
      }),
    [t],
  );
  if (!shipment) return null;
  const to = nextAdvance(shipment.status);
  if (!to) return null;
  const toLabel = pickLabel(statusLabel("shipment", to), i18n.language);
  return (
    <FormDialog
      defaultValues={{ actualAt: nowLocal(), blNo: shipment.blNo ?? "", eta: shipment.eta ?? "", note: "" }}
      {...(to === "PACKED" ? { description: t("ADVANCE_GATE_HINT") } : {})}
      open
      schema={schema}
      submitLabel={t("ADVANCE_TO", { status: toLabel })}
      title={t("ADVANCE_TITLE", { no: shipment.docNo, status: toLabel })}
      onOpenChange={(open) => !open && onClose()}
      onSubmit={(values) =>
        advance.mutateAsync({
          id: shipment.id,
          input: {
            version: shipment.version,
            to,
            ...(toIsoDateTime(values.actualAt) ? { actualAt: toIsoDateTime(values.actualAt)! } : {}),
            ...(to === "SAILED" && values.blNo ? { blNo: values.blNo } : {}),
            ...(to === "ARRIVED" && values.eta ? { eta: values.eta } : {}),
            note: values.note || null,
          },
        })
      }
    >
      {(form) => (
        <div className="grid gap-4 sm:grid-cols-2">
          <DateTimeField
            error={form.formState.errors.actualAt?.message}
            label={t("ACTUAL_AT")}
            registration={form.register("actualAt")}
          />
          {to === "SAILED" ? <FormFieldText label={t("BL_NO")} name="blNo" register={form.register} /> : null}
          {to === "ARRIVED" ? <FormFieldDate label="ETA" name="eta" register={form.register} /> : null}
          <div className="sm:col-span-2">
            <FormFieldTextarea label={t("NOTE")} name="note" register={form.register} rows={2} />
          </div>
        </div>
      )}
    </FormDialog>
  );
}

export function SignDialog({ shipment, onClose }: Props) {
  const { t } = useTranslation("shipment");
  const sign = useSignShipmentMutation();
  const schema = useMemo(
    () => z.object({ signedAt: z.string().min(1, t("DATE_REQUIRED")), note: z.string().max(500) }),
    [t],
  );
  if (!shipment) return null;
  return (
    <FormDialog
      defaultValues={{ signedAt: nowLocal(), note: "" }}
      description={t("SIGN_DESC")}
      open
      schema={schema}
      submitLabel={t("SIGN")}
      title={t("SIGN_TITLE", { no: shipment.docNo })}
      onOpenChange={(open) => !open && onClose()}
      onSubmit={(values) =>
        sign.mutateAsync({
          id: shipment.id,
          input: {
            version: shipment.version,
            ...(toIsoDateTime(values.signedAt) ? { signedAt: toIsoDateTime(values.signedAt)! } : {}),
            note: values.note || null,
          },
        })
      }
    >
      {(form) => (
        <div className="grid gap-4">
          <DateTimeField
            error={form.formState.errors.signedAt?.message}
            label={t("SIGNED_AT")}
            registration={form.register("signedAt")}
          />
          <FormFieldTextarea label={t("NOTE")} name="note" register={form.register} rows={2} />
        </div>
      )}
    </FormDialog>
  );
}
