import { AUDIT_TYPES } from "@otd/contracts/factoryaudit";
import { pickLabel } from "@otd/shared";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import { FormDialog } from "@/components/biz/form-dialog";
import { FormFieldDate } from "@/components/form/form-field-date";
import { FormFieldSelect } from "@/components/form/form-field-select";
import { FormFieldText } from "@/components/form/form-field-text";
import { FormFieldTextarea } from "@/components/form/form-field-textarea";
import { useLookups } from "@/features/masterdata/lookups.queries";

import { useSaveAuditMutation } from "../factoryaudit.mutations";

import type { AuditType, FactoryAuditDto } from "../factoryaudit.types";

const TYPES = Object.keys(AUDIT_TYPES) as AuditType[];

type AuditFormDialogProps = { open: boolean; onOpenChange: (open: boolean) => void; audit: FactoryAuditDto | null };

export function AuditFormDialog({ open, onOpenChange, audit }: AuditFormDialogProps) {
  const { t, i18n } = useTranslation("factoryaudit");
  const lookups = useLookups();
  const save = useSaveAuditMutation();
  const schema = useMemo(
    () =>
      z.object({
        factoryId: z.string().min(1, t("REQUIRED")),
        auditType: z.enum(["SOCIAL", "QUALITY", "CUSTOMER", "SECURITY"]),
        plannedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, t("REQUIRED")),
        auditor: z.string().max(120),
        customerId: z.string(),
        note: z.string().max(500),
      }),
    [t],
  );
  const factories = useMemo(() => lookups.data?.factories ?? [], [lookups.data]);
  const defaults = useMemo(
    () => ({
      factoryId: audit?.factoryId ?? factories[0]?.id ?? "",
      auditType: audit?.auditType ?? "SOCIAL",
      plannedDate: audit?.plannedDate ?? "",
      auditor: audit?.auditor ?? "",
      customerId: audit?.customerId ?? "",
      note: audit?.note ?? "",
    }),
    [audit, factories],
  );

  return (
    <FormDialog
      defaultValues={defaults}
      open={open}
      schema={schema}
      title={audit ? t("AUDIT_EDIT") : t("AUDIT_NEW")}
      width="md"
      onOpenChange={onOpenChange}
      onSubmit={(values) =>
        save.mutateAsync({
          ...(audit ? { id: audit.id } : {}),
          input: {
            factoryId: values.factoryId,
            auditType: values.auditType,
            plannedDate: values.plannedDate,
            auditor: values.auditor || null,
            ...(values.customerId ? { customerId: values.customerId } : {}),
            note: values.note || null,
            ...(audit ? { version: audit.version } : {}),
          },
        })
      }
    >
      {(form) => (
        <div className="grid gap-4 sm:grid-cols-2">
          <FormFieldSelect
            error={form.formState.errors.factoryId?.message}
            label={t("FACTORY")}
            name="factoryId"
            options={factories.map((f) => ({ value: f.id, label: `${f.code} · ${f.name}` }))}
            register={form.register}
          />
          <FormFieldSelect
            label={t("AUDIT_TYPE")}
            name="auditType"
            options={TYPES.map((type) => ({ value: type, label: pickLabel(AUDIT_TYPES[type], i18n.language) }))}
            register={form.register}
          />
          <FormFieldDate
            error={form.formState.errors.plannedDate?.message}
            label={t("PLANNED_DATE")}
            name="plannedDate"
            register={form.register}
          />
          <FormFieldText label={t("AUDITOR")} name="auditor" register={form.register} />
          <div className="space-y-1 sm:col-span-2">
            <FormFieldSelect
              label={t("CUSTOMER")}
              name="customerId"
              options={[
                { value: "", label: t("CUSTOMER_AUTO") },
                ...(lookups.data?.customers ?? []).map((c) => ({ value: c.id, label: `${c.code} · ${c.name}` })),
              ]}
              register={form.register}
            />
            <p className="text-xs text-muted-foreground">{t("CUSTOMER_HINT")}</p>
          </div>
          <div className="sm:col-span-2">
            <FormFieldTextarea label={t("NOTE")} name="note" register={form.register} rows={3} />
          </div>
        </div>
      )}
    </FormDialog>
  );
}
