import { orgFunctionSchema } from "@otd/contracts/iam";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import { FormDialog } from "@/components/biz/form-dialog";
import { FormFieldSelect } from "@/components/form/form-field-select";
import { FormFieldText } from "@/components/form/form-field-text";
import { FormFieldTextarea } from "@/components/form/form-field-textarea";
import { useLookups } from "@/features/masterdata/lookups.queries";

import { useSaveOrgMutation } from "../iam.mutations";

import type { OrgNode } from "../iam.types";

const schema = z.object({
  name: z.string().trim().min(1).max(60),
  nameEn: z.string().trim().max(120),
  type: z.enum(["GROUP", "DIVISION", "DEPARTMENT", "BASE"]),
  function: orgFunctionSchema,
  parentId: z.string(),
  leaderId: z.string(),
  status: z.enum(["ACTIVE", "DISABLED"]),
  description: z.string().max(500),
});

export const ORG_TYPES = ["GROUP", "DIVISION", "DEPARTMENT", "BASE"] as const;

function activeStatus(status: string | undefined): "ACTIVE" | "DISABLED" {
  return status === "DISABLED" ? "DISABLED" : "ACTIVE";
}

type OrgFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  org: OrgNode | null;
  parentId: string | null;
  orgs: OrgNode[];
};

export function OrgFormDialog({ open, onOpenChange, org, parentId, orgs }: OrgFormDialogProps) {
  const { t } = useTranslation("iam");
  const lookups = useLookups();
  const save = useSaveOrgMutation();
  const defaults = useMemo(
    () => ({
      name: org?.name ?? "",
      nameEn: org?.nameEn ?? "",
      type: org?.type ?? ("DEPARTMENT" as const),
      function: org?.function ?? ("SALES" as const),
      parentId: org ? (org.parentId ?? "") : (parentId ?? ""),
      leaderId: org?.leaderId ?? "",
      status: activeStatus(org?.status),
      description: org?.description ?? "",
    }),
    [org, parentId],
  );

  return (
    <FormDialog
      defaultValues={defaults}
      open={open}
      schema={schema}
      title={org ? t("ORG_EDIT") : t("ORG_NEW")}
      width="md"
      onOpenChange={onOpenChange}
      onSubmit={(values) =>
        save.mutateAsync({
          ...(org ? { id: org.id } : {}),
          input: {
            name: values.name,
            nameEn: values.nameEn || null,
            type: values.type,
            function: values.function,
            parentId: values.parentId || null,
            leaderId: values.leaderId || null,
            status: values.status,
            description: values.description || null,
            ...(org ? { version: org.version } : {}),
          },
        })
      }
    >
      {(form) => (
        <div className="grid gap-4 sm:grid-cols-2">
          <FormFieldText
            error={form.formState.errors.name?.message}
            label={t("ORG_NAME")}
            name="name"
            register={form.register}
          />
          <FormFieldText label={t("NAME_EN")} name="nameEn" register={form.register} />
          <FormFieldSelect
            label={t("ORG_TYPE")}
            name="type"
            options={ORG_TYPES.map((value) => ({ value, label: t(`ORG_TYPE_${value}`) }))}
            register={form.register}
          />
          <FormFieldSelect
            label={t("ORG_FUNCTION")}
            name="function"
            options={orgFunctionSchema.options.map((value) => ({ value, label: t(`FN_${value}`) }))}
            register={form.register}
          />
          <FormFieldSelect
            label={t("ORG_PARENT")}
            name="parentId"
            options={[
              { value: "", label: t("ORG_TOP") },
              ...orgs.filter((o) => o.id !== org?.id).map((o) => ({ value: o.id, label: `${o.name} (${o.code})` })),
            ]}
            register={form.register}
          />
          <FormFieldSelect
            label={t("ORG_LEADER")}
            name="leaderId"
            options={[
              { value: "", label: "—" },
              ...(lookups.data?.users ?? []).map((u) => ({ value: u.id, label: u.name })),
            ]}
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
            <FormFieldTextarea label={t("DESCRIPTION")} name="description" register={form.register} rows={3} />
          </div>
        </div>
      )}
    </FormDialog>
  );
}
