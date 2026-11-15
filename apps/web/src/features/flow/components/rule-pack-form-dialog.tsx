import { RULE_KINDS } from "@otd/contracts/flow";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import { FormDialog } from "@/components/biz/form-dialog";
import { FormFieldSelect } from "@/components/form/form-field-select";
import { FormFieldText } from "@/components/form/form-field-text";
import { FormFieldTextarea } from "@/components/form/form-field-textarea";
import { Switch } from "@/components/ui/switch";

import { useSaveRulePackMutation } from "../flow.mutations";

import { RULE_KIND_KEYS } from "./flow-labels";

import type { RulePackDto } from "../flow.types";

type RulePackFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pack: RulePackDto | null;
  customers: { id: string; code: string; name: string }[];
};

function parseObject(text: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(text || "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function RulePackFormDialog({ open, onOpenChange, pack, customers }: RulePackFormDialogProps) {
  const { t } = useTranslation("flow");
  const save = useSaveRulePackMutation();
  const schema = useMemo(
    () =>
      z.object({
        kind: z.enum(RULE_KINDS),
        name: z.string().trim().min(1, t("REQUIRED")).max(60),
        nameEn: z.string().trim().max(120),
        customerId: z.string(),
        params: z.string().refine((v) => parseObject(v) !== null, t("PARAMS_JSON_INVALID")),
        description: z.string().max(500),
        enabled: z.boolean(),
        reason: z.string().max(200),
      }),
    [t],
  );
  const defaults = useMemo(
    () => ({
      kind: pack?.kind ?? "PO_REVIEW",
      name: pack?.name ?? "",
      nameEn: pack?.nameEn ?? "",
      customerId: pack?.customerId ?? "",
      params: JSON.stringify(pack?.params ?? {}, null, 2),
      description: pack?.description ?? "",
      enabled: pack?.enabled ?? true,
      reason: "",
    }),
    [pack],
  );
  return (
    <FormDialog
      defaultValues={defaults}
      open={open}
      schema={schema}
      title={pack ? t("PACK_EDIT") : t("PACK_NEW")}
      width="md"
      onOpenChange={onOpenChange}
      onSubmit={(values) =>
        save.mutateAsync({
          ...(pack ? { id: pack.id } : {}),
          input: {
            kind: values.kind,
            name: values.name,
            nameEn: values.nameEn || null,
            customerId: values.customerId || null,
            params: parseObject(values.params) ?? {},
            description: values.description || null,
            enabled: values.enabled,
            ...(values.reason.trim() ? { reason: values.reason.trim() } : {}),
            ...(pack ? { version: pack.version } : {}),
          },
        })
      }
    >
      {(form) => (
        <div className="grid gap-4 sm:grid-cols-2">
          <FormFieldSelect
            disabled={Boolean(pack)}
            label={t("PACK_KIND")}
            name="kind"
            options={RULE_KINDS.map((k) => ({ value: k, label: t(RULE_KIND_KEYS[k]) }))}
            register={form.register}
          />
          <FormFieldSelect
            disabled={Boolean(pack)}
            label={t("PACK_SCOPE")}
            name="customerId"
            options={[
              { value: "", label: t("SCOPE_GLOBAL") },
              ...customers.map((c) => ({ value: c.id, label: `${c.code} · ${c.name}` })),
            ]}
            register={form.register}
          />
          <FormFieldText
            error={form.formState.errors.name?.message}
            label={t("PACK_NAME")}
            name="name"
            register={form.register}
          />
          <FormFieldText label={t("NAME_EN")} name="nameEn" register={form.register} />
          <div className="sm:col-span-2">
            <FormFieldTextarea
              className="font-mono text-xs"
              error={form.formState.errors.params?.message}
              label={t("PACK_PARAMS")}
              name="params"
              register={form.register}
              rows={8}
            />
          </div>
          <div className="sm:col-span-2">
            <FormFieldTextarea label={t("DESCRIPTION")} name="description" register={form.register} />
          </div>
          {pack ? <FormFieldText label={t("CHANGE_REASON")} name="reason" register={form.register} /> : null}
          <label className="flex items-center gap-3 self-end pb-2 text-sm">
            <Switch checked={form.watch("enabled")} onCheckedChange={(v) => form.setValue("enabled", v)} />
            {t("ENABLED")}
          </label>
        </div>
      )}
    </FormDialog>
  );
}
