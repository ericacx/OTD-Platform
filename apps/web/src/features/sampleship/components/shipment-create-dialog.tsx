import { Plus, Trash2 } from "lucide-react";
import { useMemo } from "react";
import { useFieldArray, type UseFormReturn } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import { FormDialog } from "@/components/biz/form-dialog";
import { FormFieldSelect } from "@/components/form/form-field-select";
import { FormFieldText } from "@/components/form/form-field-text";
import { FormFieldTextarea } from "@/components/form/form-field-textarea";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLookups } from "@/features/masterdata/lookups.queries";
import { useStyleOptionsQuery } from "@/features/quote/quote.queries";

import { useCreateShipmentMutation } from "../sampleship.mutations";
import { useRecipientsQuery } from "../sampleship.queries";

import type { SampleShipmentDto } from "../sampleship.types";

const SAMPLE_KINDS = ["PROTO", "SMS", "PP", "QRS", "LAB_DIP", "KNITDOWN"];

type Values = {
  customerId: string;
  recipientId: string;
  method: "COURIER" | "FORWARDER";
  courier: string;
  note: string;
  items: { styleId: string; kind: string; quantity: string }[];
};

function ShipmentFields({ form }: { form: UseFormReturn<Values> }) {
  const { t } = useTranslation("sampleship");
  const { t: tc } = useTranslation();
  const lookups = useLookups();
  const customerId = form.watch("customerId");
  const recipients = useRecipientsQuery(customerId, Boolean(customerId));
  const styles = useStyleOptionsQuery({ customerId }, Boolean(customerId));
  const items = useFieldArray({ control: form.control, name: "items" });
  const errors = form.formState.errors;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <FormFieldSelect
        error={errors.customerId?.message}
        label={t("CUSTOMER")}
        name="customerId"
        options={[
          { value: "", label: t("CUSTOMER_PICK") },
          ...(lookups.data?.customers ?? []).map((c) => ({ value: c.id, label: c.name })),
        ]}
        register={form.register}
      />
      <FormFieldSelect
        disabled={!customerId}
        label={t("RECIPIENT")}
        name="recipientId"
        options={[
          { value: "", label: t("RECIPIENT_PICK") },
          ...(recipients.data ?? []).map((r) => ({ value: r.id, label: `${r.company} · ${r.name}` })),
        ]}
        register={form.register}
      />
      <FormFieldSelect
        label={t("METHOD")}
        name="method"
        options={[
          { value: "COURIER", label: t("METHOD_COURIER") },
          { value: "FORWARDER", label: t("METHOD_FORWARDER") },
        ]}
        register={form.register}
      />
      <FormFieldText label={t("COURIER")} name="courier" register={form.register} />
      <fieldset className="space-y-2 sm:col-span-2">
        <legend className="text-sm font-medium">{t("ITEMS")}</legend>
        {items.fields.map((field, index) => (
          <div className="flex flex-wrap items-center gap-2" key={field.id}>
            <select
              aria-label={t("ITEM_STYLE", { index: index + 1 })}
              className="h-9 min-w-56 flex-1 rounded-md border border-input bg-transparent px-2 text-sm"
              disabled={!customerId}
              {...form.register(`items.${index}.styleId`)}
            >
              <option value="">{t("STYLE_PICK")}</option>
              {(styles.data ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  #{s.styleNo} · {s.nameZh}
                </option>
              ))}
            </select>
            <Input
              aria-label={t("ITEM_KIND", { index: index + 1 })}
              className="h-9 w-32"
              list="sample-kinds"
              {...form.register(`items.${index}.kind`)}
            />
            <Input
              aria-label={t("ITEM_QTY", { index: index + 1 })}
              className="tabular h-9 w-24"
              inputMode="numeric"
              {...form.register(`items.${index}.quantity`)}
            />
            <Button
              aria-label={tc("jAiN8T")}
              disabled={items.fields.length === 1}
              size="icon"
              type="button"
              variant="ghost"
              onClick={() => items.remove(index)}
            >
              <Trash2 aria-hidden="true" className="size-4" />
            </Button>
          </div>
        ))}
        <datalist id="sample-kinds">
          {SAMPLE_KINDS.map((kind) => (
            <option key={kind} value={kind} />
          ))}
        </datalist>
        {errors.items ? (
          <p className="text-sm text-destructive" role="alert">
            {t("ITEMS_INVALID")}
          </p>
        ) : null}
        <Button
          size="sm"
          type="button"
          variant="outline"
          onClick={() => items.append({ styleId: "", kind: "PROTO", quantity: "1" })}
        >
          <Plus aria-hidden="true" className="size-4" />
          {t("ITEM_ADD")}
        </Button>
      </fieldset>
      <div className="sm:col-span-2">
        <FormFieldTextarea label={t("NOTE")} name="note" register={form.register} rows={2} />
      </div>
    </div>
  );
}

type Props = { open: boolean; onOpenChange: (open: boolean) => void; onCreated: (shipment: SampleShipmentDto) => void };

export function ShipmentCreateDialog({ open, onOpenChange, onCreated }: Props) {
  const { t } = useTranslation("sampleship");
  const { t: tc } = useTranslation();
  const create = useCreateShipmentMutation();
  const schema = useMemo(
    () =>
      z.object({
        customerId: z.string().min(1, tc("FRMREQ")),
        recipientId: z.string(),
        method: z.enum(["COURIER", "FORWARDER"]),
        courier: z.string().max(60),
        note: z.string().max(500),
        items: z
          .array(
            z.object({
              styleId: z.string().min(1),
              kind: z.string().trim().min(1),
              quantity: z.string().regex(/^[1-9]\d*$/),
            }),
          )
          .min(1),
      }),
    [tc],
  );
  const defaults: Values = {
    customerId: "",
    recipientId: "",
    method: "COURIER",
    courier: "",
    note: "",
    items: [{ styleId: "", kind: "PROTO", quantity: "1" }],
  };
  return (
    <FormDialog
      defaultValues={defaults}
      open={open}
      schema={schema}
      title={t("SHIPMENT_NEW")}
      width="md"
      onOpenChange={onOpenChange}
      onSubmit={async (values) =>
        onCreated(
          await create.mutateAsync({
            customerId: values.customerId,
            recipientId: values.recipientId || null,
            method: values.method,
            courier: values.courier.trim() || null,
            note: values.note.trim() || null,
            items: values.items.map((item) => ({
              styleId: item.styleId,
              kind: item.kind.trim(),
              quantity: Number(item.quantity),
            })),
          }),
        )
      }
    >
      {(form) => <ShipmentFields form={form} />}
    </FormDialog>
  );
}
