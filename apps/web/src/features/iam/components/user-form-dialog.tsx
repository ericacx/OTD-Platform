import { useMemo } from "react";
import { Controller } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import { FormDialog } from "@/components/biz/form-dialog";
import { FormFieldSelect } from "@/components/form/form-field-select";
import { FormFieldText } from "@/components/form/form-field-text";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

import { useSaveUserMutation } from "../iam.mutations";

import type { OrgNode, RoleSummary, UserSummary } from "../iam.types";

type UserFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: UserSummary | null;
  defaultOrgId?: string | null;
  orgs: OrgNode[];
  roles: RoleSummary[];
  onCreated?: (initialPassword: string, name: string) => void;
};

export function UserFormDialog({
  open,
  onOpenChange,
  user,
  defaultOrgId,
  orgs,
  roles,
  onCreated,
}: UserFormDialogProps) {
  const { t } = useTranslation("iam");
  const save = useSaveUserMutation();
  const schema = useMemo(
    () =>
      z.object({
        name: z.string().trim().min(1).max(40),
        nameEn: z.string().trim().max(80),
        phone: z.string().regex(/^1\d{10}$/, t("PHONE_INVALID")),
        email: z.union([z.literal(""), z.email(t("EMAIL_INVALID"))]),
        employeeNo: z.string().max(40),
        orgId: z.string().min(1, t("ORG_REQUIRED")),
        roleIds: z.array(z.string()).min(1, t("ROLE_REQUIRED")),
        status: z.enum(["ACTIVE", "DISABLED", "LEFT"]),
      }),
    [t],
  );
  const defaults = useMemo(
    () => ({
      name: user?.name ?? "",
      nameEn: user?.nameEn ?? "",
      phone: user?.phone ?? "",
      email: user?.email ?? "",
      employeeNo: user?.employeeNo ?? "",
      orgId: user?.orgId ?? defaultOrgId ?? "",
      roleIds: user?.roles.map((r) => r.id) ?? [],
      status: (user?.status ?? "ACTIVE") as "ACTIVE" | "DISABLED" | "LEFT",
    }),
    [user, defaultOrgId],
  );

  return (
    <FormDialog
      defaultValues={defaults}
      open={open}
      schema={schema}
      title={user ? t("USER_EDIT") : t("USER_NEW")}
      width="md"
      onOpenChange={onOpenChange}
      onSubmit={async (values) => {
        const result = await save.mutateAsync({
          ...(user ? { id: user.id } : {}),
          input: {
            name: values.name,
            nameEn: values.nameEn || null,
            phone: values.phone,
            email: values.email || null,
            employeeNo: values.employeeNo || null,
            orgId: values.orgId,
            roleIds: values.roleIds,
            status: values.status,
            ...(user ? { version: user.version } : {}),
          },
        });
        if (!user && result.initialPassword) onCreated?.(result.initialPassword, result.name);
      }}
    >
      {(form) => (
        <div className="grid gap-4 sm:grid-cols-2">
          <FormFieldText
            error={form.formState.errors.name?.message}
            label={t("USER_NAME")}
            name="name"
            register={form.register}
          />
          <FormFieldText label={t("NAME_EN")} name="nameEn" register={form.register} />
          <FormFieldText
            error={form.formState.errors.phone?.message}
            inputMode="numeric"
            label={t("PHONE")}
            name="phone"
            register={form.register}
            type="tel"
          />
          <FormFieldText
            error={form.formState.errors.email?.message}
            label={t("EMAIL")}
            name="email"
            register={form.register}
            type="email"
          />
          <FormFieldText label={t("EMPLOYEE_NO")} name="employeeNo" register={form.register} />
          <FormFieldSelect
            error={form.formState.errors.orgId?.message}
            label={t("ORG")}
            name="orgId"
            options={[{ value: "", label: "—" }, ...orgs.map((o) => ({ value: o.id, label: `${o.name} (${o.code})` }))]}
            register={form.register}
          />
          <FormFieldSelect
            label={t("STATUS")}
            name="status"
            options={[
              { value: "ACTIVE", label: t("USER_ACTIVE") },
              { value: "DISABLED", label: t("DISABLED") },
              { value: "LEFT", label: t("USER_LEFT") },
            ]}
            register={form.register}
          />
          <div className="space-y-2 sm:col-span-2">
            <Label>{t("ROLES")}</Label>
            <Controller
              control={form.control}
              name="roleIds"
              render={({ field, fieldState }) => (
                <div>
                  <div className="grid grid-cols-2 gap-2 rounded-md border border-border p-3 sm:grid-cols-3">
                    {roles.map((role) => (
                      <label className="flex items-center gap-2 text-sm" key={role.id}>
                        <Checkbox
                          aria-label={role.name}
                          checked={field.value.includes(role.id)}
                          onCheckedChange={(v) =>
                            field.onChange(
                              v === true ? [...field.value, role.id] : field.value.filter((id) => id !== role.id),
                            )
                          }
                        />
                        {role.name}
                        <span className="text-xs text-muted-foreground">{role.code}</span>
                      </label>
                    ))}
                  </div>
                  {fieldState.error ? (
                    <p className="mt-1 text-sm font-medium text-destructive" role="alert">
                      {fieldState.error.message}
                    </p>
                  ) : null}
                </div>
              )}
            />
          </div>
        </div>
      )}
    </FormDialog>
  );
}
