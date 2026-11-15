import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import { FormDialog } from "@/components/biz/form-dialog";
import { FormFieldText } from "@/components/form/form-field-text";

import { useSendShipmentMutation } from "../sampleship.mutations";

import type { SampleShipmentDto } from "../sampleship.types";

type Props = { shipment: SampleShipmentDto; open: boolean; onOpenChange: (open: boolean) => void };

export function SendDialog({ shipment, open, onOpenChange }: Props) {
  const { t } = useTranslation("sampleship");
  const send = useSendShipmentMutation();
  const schema = useMemo(
    () => z.object({ trackingNo: z.string().trim().min(3, t("TRACKING_RULE")).max(60), courier: z.string().max(60) }),
    [t],
  );
  return (
    <FormDialog
      defaultValues={{ trackingNo: shipment.trackingNo ?? "", courier: shipment.courier ?? "" }}
      open={open}
      schema={schema}
      submitLabel={t("SEND")}
      title={t("SEND_TITLE", { docNo: shipment.docNo })}
      onOpenChange={onOpenChange}
      onSubmit={(values) =>
        send.mutateAsync({
          id: shipment.id,
          trackingNo: values.trackingNo.trim(),
          ...(values.courier.trim() ? { courier: values.courier.trim() } : {}),
          version: shipment.version,
        })
      }
    >
      {(form) => (
        <div className="grid gap-4 sm:grid-cols-2">
          <FormFieldText
            error={form.formState.errors.trackingNo?.message}
            label={t("TRACKING_NO")}
            name="trackingNo"
            register={form.register}
          />
          <FormFieldText label={t("COURIER")} name="courier" register={form.register} />
        </div>
      )}
    </FormDialog>
  );
}
