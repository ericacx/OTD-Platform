import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import { FormDialog } from "@/components/biz/form-dialog";
import { FormFieldSelect } from "@/components/form/form-field-select";
import { FormFieldText } from "@/components/form/form-field-text";
import { Switch } from "@/components/ui/switch";

import { useSaveCustomerMutation } from "../masterdata.mutations";

import type { CustomerDto } from "../masterdata.types";

const CURRENCIES = ["USD", "EUR", "JPY", "CNY", "GBP", "HKD"];

function activeStatus(status: string | undefined): "ACTIVE" | "DISABLED" {
  return status === "DISABLED" ? "DISABLED" : "ACTIVE";
}

type CustomerFormDialogProps = { open: boolean; onOpenChange: (open: boolean) => void; customer: CustomerDto | null };

export function CustomerFormDialog({ open, onOpenChange, customer }: CustomerFormDialogProps) {
  const { t } = useTranslation("masterdata");
  const save = useSaveCustomerMutation();
  const schema = useMemo(
    () =>
      z.object({
        code: z
          .string()
          .trim()
          .regex(/^[A-Z0-9]{2,8}$/, t("CODE_RULE")),
        name: z.string().trim().min(1).max(60),
        nameEn: z.string().trim().max(120),
        settlementEntity: z.string().max(120),
        paymentTermsDays: z.coerce.number().int().min(0).max(365),
        currency: z.string().length(3),
        contactName: z.string().max(60),
        contactEmail: z.union([z.literal(""), z.email()]),
        aiAllowed: z.boolean(),
        status: z.enum(["ACTIVE", "DISABLED"]),
      }),
    [t],
  );
  const defaults = useMemo(
    () => ({
      code: customer?.code ?? "",
      name: customer?.name ?? "",
      nameEn: customer?.nameEn ?? "",
      settlementEntity: customer?.settlementEntity ?? "",
      paymentTermsDays: customer?.paymentTermsDays ?? 60,
      currency: customer?.currency ?? "USD",
      contactName: customer?.contactName ?? "",
      contactEmail: customer?.contactEmail ?? "",
      aiAllowed: customer?.aiAllowed ?? true,
      status: activeStatus(customer?.status),
    }),
    [customer],
  );

  return (
    <FormDialog
      defaultValues={defaults}
      open={open}
      schema={schema}
      title={customer ? t("CUSTOMER_EDIT") : t("CUSTOMER_NEW")}
      width="md"
      onOpenChange={onOpenChange}
      onSubmit={(values) =>
        save.mutateAsync({
          ...(customer ? { id: customer.id } : {}),
          input: {
            code: values.code,
            name: values.name,
            nameEn: values.nameEn || null,
            logoText: values.nameEn ? values.nameEn.toUpperCase() : null,
            settlementEntity: values.settlementEntity || null,
            paymentTermsDays: values.paymentTermsDays,
            currency: values.currency,
            contactName: values.contactName || null,
            contactEmail: values.contactEmail || null,
            aiAllowed: values.aiAllowed,
            status: values.status,
            ...(customer ? { version: customer.version } : {}),
          },
        })
      }
    >
      {(form) => (
        <div className="grid gap-4 sm:grid-cols-2">
          <FormFieldText
            disabled={Boolean(customer)}
            error={form.formState.errors.code?.message}
            label={t("CODE")}
            name="code"
            register={form.register}
          />
          <FormFieldText
            error={form.formState.errors.name?.message}
            label={t("NAME")}
            name="name"
            register={form.register}
          />
          <FormFieldText label={t("NAME_EN")} name="nameEn" register={form.register} />
          <FormFieldText label={t("SETTLEMENT_ENTITY")} name="settlementEntity" register={form.register} />
          <FormFieldText
            error={form.formState.errors.paymentTermsDays?.message}
            label={t("PAYMENT_TERMS")}
            name="paymentTermsDays"
            register={form.register}
            type="number"
          />
          <FormFieldSelect
            label={t("CURRENCY")}
            name="currency"
            options={CURRENCIES.map((c) => ({ value: c, label: c }))}
            register={form.register}
          />
          <FormFieldText label={t("CONTACT")} name="contactName" register={form.register} />
          <FormFieldText
            error={form.formState.errors.contactEmail?.message}
            label={t("CONTACT_EMAIL")}
            name="contactEmail"
            register={form.register}
            type="email"
          />
          <FormFieldSelect
            label={t("STATUS")}
            name="status"
            options={[
              { value: "ACTIVE", label: t("ACTIVE") },
              { value: "DISABLED", label: t("DISABLED") },
            ]}
            register={form.register}
          />
          <label className="flex items-center gap-3 self-end pb-2 text-sm">
            <Switch checked={form.watch("aiAllowed")} onCheckedChange={(v) => form.setValue("aiAllowed", v)} />
            {t("AI_ALLOWED")}
          </label>
        </div>
      )}
    </FormDialog>
  );
}
