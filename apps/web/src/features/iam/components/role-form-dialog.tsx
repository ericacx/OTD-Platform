import { DATA_SCOPES, ROLE_TYPES, pickLabel } from "@otd/shared";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import { FormDialog } from "@/components/biz/form-dialog";
import { FormFieldSelect } from "@/components/form/form-field-select";
import { FormFieldText } from "@/components/form/form-field-text";
import { FormFieldTextarea } from "@/components/form/form-field-textarea";

import { useSaveRoleMutation } from "../iam.mutations";

import type { RoleSummary } from "../iam.types";

const schema = z.object({
  name: z.string().trim().min(1).max(40),
  nameEn: z.string().trim().max(80),
  type: z.enum(["BUSINESS", "MANAGEMENT"]),
  dataScope: z.enum(["SELF", "ORG", "ORG_AND_CHILDREN", "ALL"]),
  status: z.enum(["ACTIVE", "DISABLED"]),
  description: z.string().max(200),
});

function activeStatus(status: string | undefined): "ACTIVE" | "DISABLED" {
  return status === "DISABLED" ? "DISABLED" : "ACTIVE";
}

type RoleFormDialogProps = { open: boolean; role: RoleSummary | null; onOpenChange: (open: boolean) => void };

export function RoleFormDialog({ open, role, onOpenChange }: RoleFormDialogProps) {
  const { t, i18n } = useTranslation("iam");
  const save = useSaveRoleMutation();
  const defaults = useMemo(
    () => ({
      name: role?.name ?? "",
      nameEn: role?.nameEn ?? "",
      type: role?.type ?? ("BUSINESS" as const),
      dataScope: role?.dataScope ?? ("SELF" as const),
      status: activeStatus(role?.status),
      description: role?.description ?? "",
    }),
    [role],
  );
  const lang = i18n.language;

  return (
    <FormDialog
      defaultValues={defaults}
      open={open}
      schema={schema}
      title={role ? t("ROLE_EDIT") : t("ROLE_NEW")}
      onOpenChange={onOpenChange}
      onSubmit={(values) =>
        save.mutateAsync({
          ...(role ? { id: role.id } : {}),
          input: {
            ...values,
            nameEn: values.nameEn || null,
            description: values.description || null,
            ...(role ? { version: role.version } : {}),
          },
        })
      }
    >
      {(form) => (
        <div className="grid gap-4 sm:grid-cols-2">
          <FormFieldText
            error={form.formState.errors.name?.message}
            label={t("ROLE_NAME")}
            name="name"
            register={form.register}
          />
          <FormFieldText label={t("NAME_EN")} name="nameEn" register={form.register} />
          <FormFieldSelect
            label={t("ROLE_TYPE")}
            name="type"
            options={Object.entries(ROLE_TYPES).map(([value, v]) => ({ value, label: pickLabel(v.label, lang) }))}
            register={form.register}
          />
          <FormFieldSelect
            label={t("DATA_SCOPE")}
            name="dataScope"
            options={Object.entries(DATA_SCOPES).map(([value, v]) => ({ value, label: pickLabel(v.label, lang) }))}
            register={form.register}
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
          <div className="sm:col-span-2">
            <FormFieldTextarea label={t("DESCRIPTION")} name="description" register={form.register} />
          </div>
        </div>
      )}
    </FormDialog>
  );
}
