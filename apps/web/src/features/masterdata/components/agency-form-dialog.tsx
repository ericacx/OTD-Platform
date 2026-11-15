import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import { FormDialog } from "@/components/biz/form-dialog";
import { FormFieldText } from "@/components/form/form-field-text";

import { useSaveReferenceMutation } from "../reference-data.mutations";

import type { AgencyDto, agencyUpsertSchema } from "@otd/contracts/masterdata";

type AgencyFormDialogProps = { open: boolean; onOpenChange: (open: boolean) => void; agency: AgencyDto | null };

export function AgencyFormDialog({ open, onOpenChange, agency }: AgencyFormDialogProps) {
  const { t } = useTranslation("masterdata");
  const save = useSaveReferenceMutation<AgencyDto, z.input<typeof agencyUpsertSchema>>("agencies");
  const schema = useMemo(
    () =>
      z.object({
        code: z.string().trim().min(1).max(20),
        name: z.string().trim().min(1).max(60),
        city: z.string().trim().max(40),
        contact: z.string().trim().max(120),
      }),
    [],
  );
  const defaults = useMemo(
    () => ({
      code: agency?.code ?? "",
      name: agency?.name ?? "",
      city: agency?.city ?? "",
      contact: agency?.contact ?? "",
    }),
    [agency],
  );

  return (
    <FormDialog
      defaultValues={defaults}
      open={open}
      schema={schema}
      title={agency ? t("AGENCY_EDIT") : t("AGENCY_NEW")}
      onOpenChange={onOpenChange}
      onSubmit={(values) =>
        save.mutateAsync({
          id: agency?.id,
          input: {
            code: values.code,
            name: values.name,
            city: values.city || null,
            contact: values.contact || null,
            ...(agency ? { version: agency.version } : {}),
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
          <FormFieldText label={t("AGENCY_CITY")} name="city" register={form.register} />
          <FormFieldText label={t("COL_CONTACT")} name="contact" register={form.register} />
        </div>
      )}
    </FormDialog>
  );
}
