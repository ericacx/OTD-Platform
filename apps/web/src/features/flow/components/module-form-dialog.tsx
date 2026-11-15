import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import { FormDialog } from "@/components/biz/form-dialog";
import { FormFieldSelect } from "@/components/form/form-field-select";
import { FormFieldText } from "@/components/form/form-field-text";
import { FormFieldTextarea } from "@/components/form/form-field-textarea";
import { Switch } from "@/components/ui/switch";

import { useSaveModuleMutation } from "../flow.mutations";

import { DEPARTMENTS } from "./flow-labels";

import type { ServiceModuleDto } from "../flow.types";

type ModuleFormDialogProps = { open: boolean; onOpenChange: (open: boolean) => void; module: ServiceModuleDto | null };

export function ModuleFormDialog({ open, onOpenChange, module }: ModuleFormDialogProps) {
  const { t } = useTranslation("flow");
  const save = useSaveModuleMutation();
  const schema = useMemo(
    () =>
      z.object({
        name: z.string().trim().min(1, t("REQUIRED")).max(40),
        nameEn: z.string().trim().max(80),
        department: z.string().min(1),
        sort: z.coerce.number().int().min(0),
        hasPage: z.boolean(),
        description: z.string().max(500),
      }),
    [t],
  );
  const defaults = useMemo(
    () => ({
      name: module?.name ?? "",
      nameEn: module?.nameEn ?? "",
      department: module?.department ?? DEPARTMENTS[0]!,
      sort: module?.sort ?? 0,
      hasPage: module?.hasPage ?? true,
      description: module?.description ?? "",
    }),
    [module],
  );
  return (
    <FormDialog
      defaultValues={defaults}
      open={open}
      schema={schema}
      title={module ? t("MODULE_EDIT") : t("MODULE_NEW")}
      onOpenChange={onOpenChange}
      onSubmit={(values) =>
        save.mutateAsync({
          ...(module ? { id: module.id } : {}),
          input: {
            name: values.name,
            nameEn: values.nameEn || null,
            department: values.department,
            ...(module || values.sort > 0 ? { sort: values.sort } : {}),
            hasPage: values.hasPage,
            description: values.description || null,
            ...(module ? { version: module.version } : {}),
          },
        })
      }
    >
      {(form) => (
        <div className="grid gap-4 sm:grid-cols-2">
          <FormFieldText
            error={form.formState.errors.name?.message}
            label={t("MODULE_NAME")}
            name="name"
            register={form.register}
          />
          <FormFieldText label={t("NAME_EN")} name="nameEn" register={form.register} />
          <FormFieldSelect
            label={t("DEPARTMENT")}
            name="department"
            options={[...new Set([...DEPARTMENTS, defaults.department])].map((d) => ({ value: d, label: d }))}
            register={form.register}
          />
          <FormFieldText label={t("SORT")} name="sort" register={form.register} type="number" />
          <div className="sm:col-span-2">
            <FormFieldTextarea label={t("DESCRIPTION")} name="description" register={form.register} />
          </div>
          <label className="flex items-center gap-3 text-sm">
            <Switch checked={form.watch("hasPage")} onCheckedChange={(v) => form.setValue("hasPage", v)} />
            {t("HAS_PAGE")}
          </label>
        </div>
      )}
    </FormDialog>
  );
}
