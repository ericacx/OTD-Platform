import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import { FormDialog } from "@/components/biz/form-dialog";
import { FormFieldSelect } from "@/components/form/form-field-select";
import { FormFieldText } from "@/components/form/form-field-text";
import { FormFieldTextarea } from "@/components/form/form-field-textarea";
import { useLookups } from "@/features/masterdata/lookups.queries";

import { useSaveRecipientMutation } from "../sampleship.mutations";

import type { RecipientDto } from "../sampleship.types";

type Props = { open: boolean; onOpenChange: (open: boolean) => void; recipient: RecipientDto | null };

export function RecipientFormDialog({ open, onOpenChange, recipient }: Props) {
  const { t } = useTranslation("sampleship");
  const { t: tc } = useTranslation();
  const lookups = useLookups();
  const save = useSaveRecipientMutation();
  const schema = useMemo(
    () =>
      z.object({
        customerId: z.string().min(1, tc("FRMREQ")),
        company: z.string().trim().min(1, tc("FRMREQ")).max(120),
        name: z.string().trim().min(1, tc("FRMREQ")).max(60),
        address: z.string().trim().min(1, tc("FRMREQ")).max(300),
        phone: z.string().max(40),
        email: z.union([z.literal(""), z.email(tc("FRMINV"))]),
        courier: z.string().max(60),
        isDefault: z.enum(["true", "false"]),
      }),
    [tc],
  );
  const defaults = useMemo(
    () => ({
      customerId: recipient?.customerId ?? "",
      company: recipient?.company ?? "",
      name: recipient?.name ?? "",
      address: recipient?.address ?? "",
      phone: recipient?.phone ?? "",
      email: recipient?.email ?? "",
      courier: recipient?.courier ?? "",
      isDefault: recipient?.isDefault ? ("true" as const) : ("false" as const),
    }),
    [recipient],
  );
  return (
    <FormDialog
      defaultValues={defaults}
      open={open}
      schema={schema}
      title={recipient ? t("RECIPIENT_EDIT") : t("RECIPIENT_NEW")}
      width="md"
      onOpenChange={onOpenChange}
      onSubmit={(values) =>
        save.mutateAsync({
          ...(recipient ? { id: recipient.id } : {}),
          input: {
            customerId: values.customerId,
            company: values.company.trim(),
            name: values.name.trim(),
            address: values.address.trim(),
            phone: values.phone.trim() || null,
            email: values.email || null,
            courier: values.courier.trim() || null,
            isDefault: values.isDefault === "true",
            ...(recipient ? { version: recipient.version } : {}),
          },
        })
      }
    >
      {(form) => (
        <div className="grid gap-4 sm:grid-cols-2">
          <FormFieldSelect
            disabled={Boolean(recipient)}
            error={form.formState.errors.customerId?.message}
            label={t("CUSTOMER")}
            name="customerId"
            options={[
              { value: "", label: t("CUSTOMER_PICK") },
              ...(lookups.data?.customers ?? []).map((c) => ({ value: c.id, label: c.name })),
            ]}
            register={form.register}
          />
          <FormFieldText
            error={form.formState.errors.company?.message}
            label={t("COMPANY")}
            name="company"
            register={form.register}
          />
          <FormFieldText
            error={form.formState.errors.name?.message}
            label={t("CONTACT_NAME")}
            name="name"
            register={form.register}
          />
          <FormFieldText label={t("PHONE")} name="phone" register={form.register} />
          <FormFieldText
            error={form.formState.errors.email?.message}
            label={t("EMAIL")}
            name="email"
            register={form.register}
          />
          <FormFieldText label={t("DEFAULT_COURIER")} name="courier" register={form.register} />
          <FormFieldSelect
            label={t("IS_DEFAULT")}
            name="isDefault"
            options={[
              { value: "false", label: t("NO") },
              { value: "true", label: t("YES") },
            ]}
            register={form.register}
          />
          <div className="sm:col-span-2">
            <FormFieldTextarea
              error={form.formState.errors.address?.message}
              label={t("ADDRESS")}
              name="address"
              register={form.register}
              rows={2}
            />
          </div>
        </div>
      )}
    </FormDialog>
  );
}
