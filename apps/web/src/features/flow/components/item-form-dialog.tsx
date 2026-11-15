import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import { FormDialog } from "@/components/biz/form-dialog";
import { FormFieldText } from "@/components/form/form-field-text";
import { FormFieldTextarea } from "@/components/form/form-field-textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";

import { useSaveItemMutation } from "../flow.mutations";

import { GATE_CONDITION_CODES, NODE_CODES, gateConditionLabel, nodeLabel } from "./flow-labels";

import type { ServiceItemDto } from "../flow.types";

type ItemFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  moduleId: string;
  item: ServiceItemDto | null;
};

function toggle(list: string[], value: string, on: boolean): string[] {
  return on ? [...new Set([...list, value])] : list.filter((v) => v !== value);
}

export function ItemFormDialog({ open, onOpenChange, moduleId, item }: ItemFormDialogProps) {
  const { t, i18n } = useTranslation("flow");
  const save = useSaveItemMutation();
  const schema = useMemo(
    () =>
      z.object({
        name: z.string().trim().min(1, t("REQUIRED")).max(60),
        nameEn: z.string().trim().max(120),
        department: z.string().trim().max(30),
        description: z.string().max(500),
        requiresCustomerConfirm: z.boolean(),
        nodes: z.array(z.string()),
        gateConditions: z.array(z.string()),
      }),
    [t],
  );
  const defaults = useMemo(
    () => ({
      name: item?.name ?? "",
      nameEn: item?.nameEn ?? "",
      department: item?.department ?? "",
      description: item?.description ?? "",
      requiresCustomerConfirm: item?.requiresCustomerConfirm ?? false,
      nodes: item?.effects.nodes ?? [],
      gateConditions: item?.effects.gateConditions ?? [],
    }),
    [item],
  );
  return (
    <FormDialog
      defaultValues={defaults}
      open={open}
      schema={schema}
      title={item ? t("ITEM_EDIT") : t("ITEM_NEW")}
      width="md"
      onOpenChange={onOpenChange}
      onSubmit={(values) =>
        save.mutateAsync({
          moduleId,
          ...(item ? { id: item.id } : {}),
          input: {
            name: values.name,
            nameEn: values.nameEn || null,
            department: values.department || null,
            description: values.description || null,
            requiresCustomerConfirm: values.requiresCustomerConfirm,
            effects: { ...(item?.effects ?? {}), nodes: values.nodes, gateConditions: values.gateConditions },
            ...(item ? { version: item.version } : {}),
          },
        })
      }
    >
      {(form) => {
        const nodes = form.watch("nodes");
        const gates = form.watch("gateConditions");
        return (
          <div className="grid gap-4 sm:grid-cols-2">
            <FormFieldText
              error={form.formState.errors.name?.message}
              label={t("ITEM_NAME")}
              name="name"
              register={form.register}
            />
            <FormFieldText label={t("NAME_EN")} name="nameEn" register={form.register} />
            <FormFieldText label={t("DEPARTMENT")} name="department" register={form.register} />
            <label className="flex items-center gap-3 self-end pb-2 text-sm">
              <Switch
                checked={form.watch("requiresCustomerConfirm")}
                onCheckedChange={(v) => form.setValue("requiresCustomerConfirm", v)}
              />
              {t("REQUIRES_CONFIRM")}
            </label>
            <div className="sm:col-span-2">
              <FormFieldTextarea label={t("DESCRIPTION")} name="description" register={form.register} />
            </div>
            <fieldset className="space-y-2 sm:col-span-2">
              <legend className="text-sm font-medium">{t("EFFECT_NODES")}</legend>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {NODE_CODES.map((code) => (
                  <label className="flex items-center gap-2 text-xs" key={code}>
                    <Checkbox
                      aria-label={`${code} ${nodeLabel(code, i18n.language)}`}
                      checked={nodes.includes(code)}
                      onCheckedChange={(v) => form.setValue("nodes", toggle(nodes, code, v === true))}
                    />
                    <span className="tabular">{code}</span>
                    <span className="truncate text-muted-foreground">{nodeLabel(code, i18n.language)}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset className="space-y-2 sm:col-span-2">
              <legend className="text-sm font-medium">{t("EFFECT_GATES")}</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {GATE_CONDITION_CODES.map((g) => (
                  <label className="flex items-center gap-2 text-xs" key={g.code}>
                    <Checkbox
                      aria-label={`${g.gate} ${gateConditionLabel(g.gate, g.key, i18n.language)}`}
                      checked={gates.includes(g.code)}
                      onCheckedChange={(v) => form.setValue("gateConditions", toggle(gates, g.code, v === true))}
                    />
                    <span className="tabular">{g.gate}</span>
                    <span>{gateConditionLabel(g.gate, g.key, i18n.language)}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
        );
      }}
    </FormDialog>
  );
}
