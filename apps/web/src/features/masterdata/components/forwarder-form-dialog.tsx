import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import { FormDialog } from "@/components/biz/form-dialog";
import { FormFieldSelect } from "@/components/form/form-field-select";
import { FormFieldText } from "@/components/form/form-field-text";

import { useSaveReferenceMutation } from "../reference-data.mutations";

import type { ForwarderDto, forwarderUpsertSchema } from "@otd/contracts/masterdata";

export const FORWARDER_TYPES = ["FORWARDER", "CARRIER"] as const;

type ForwarderFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  forwarder: ForwarderDto | null;
};

export function ForwarderFormDialog({ open, onOpenChange, forwarder }: ForwarderFormDialogProps) {
  const { t } = useTranslation("masterdata");
  const save = useSaveReferenceMutation<ForwarderDto, z.input<typeof forwarderUpsertSchema>>("forwarders");
  const schema = useMemo(
    () =>
      z.object({
        code: z.string().trim().min(1).max(20),
        name: z.string().trim().min(1).max(60),
        type: z.enum(FORWARDER_TYPES),
        contact: z.string().trim().max(120),
      }),
    [],
  );
  const defaults = useMemo(
    () => ({
      code: forwarder?.code ?? "",
      name: forwarder?.name ?? "",
      type: forwarder?.type ?? "FORWARDER",
      contact: forwarder?.contact ?? "",
    }),
    [forwarder],
  );

  return (
    <FormDialog
      defaultValues={defaults}
      open={open}
      schema={schema}
      title={forwarder ? t("FORWARDER_EDIT") : t("FORWARDER_NEW")}
      onOpenChange={onOpenChange}
      onSubmit={(values) =>
        save.mutateAsync({
          id: forwarder?.id,
          input: {
            code: values.code,
            name: values.name,
            type: values.type,
            contact: values.contact || null,
            ...(forwarder ? { version: forwarder.version } : {}),
          },
        })
      }
    >
      {(form) => (
        <div className="grid gap-4 sm:grid-cols-2">
          <FormFieldText
            error={form.formState.errors.code?.message}
            label={t("COL_CODE")}
            name="code"
            register={form.register}
          />
          <FormFieldText
            error={form.formState.errors.name?.message}
            label={t("COL_NAME")}
            name="name"
            register={form.register}
          />
          <FormFieldSelect
            label={t("FORWARDER_TYPE")}
            name="type"
            options={[
              { value: "FORWARDER", label: t("TYPE_FORWARDER") },
              { value: "CARRIER", label: t("TYPE_CARRIER") },
            ]}
            register={form.register}
          />
          <FormFieldText label={t("COL_CONTACT")} name="contact" register={form.register} />
        </div>
      )}
    </FormDialog>
  );
}
