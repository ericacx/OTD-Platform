import { Plus, Trash2 } from "lucide-react";
import { useMemo } from "react";
import { useFieldArray, type UseFormReturn } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import { FormDialog } from "@/components/biz/form-dialog";
import { FormFieldSelect } from "@/components/form/form-field-select";
import { FormFieldText } from "@/components/form/form-field-text";
import { FormFieldTextarea } from "@/components/form/form-field-textarea";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { useCreatePlanMutation, useUpdatePlanMutation } from "../packaging.mutations";
import { usePackagingOrderOptionsQuery } from "../packaging.queries";

import type { PackagingPlanDetailDto } from "../packaging.types";

const TEXT_FIELDS = [
  "cartonSize",
  "cartonType",
  "strength",
  "shippingMark",
  "markPosition",
  "sizeSticker",
  "sealSticker",
  "innerBag",
  "tape",
  "destination",
] as const;

type FormValues = {
  orderId: string;
  title: string;
  method: string;
  pairsPerCarton: number;
  cartonSize: string;
  cartonType: string;
  strength: string;
  shippingMark: string;
  markPosition: string;
  sizeSticker: string;
  sealSticker: string;
  innerBag: string;
  tape: string;
  destination: string;
  requirements: { title: string; content: string }[];
  changeNote: string;
};

function RequirementsEditor({ form }: { form: UseFormReturn<FormValues> }) {
  const { t } = useTranslation("packaging");
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "requirements" });
  return (
    <div className="space-y-2 sm:col-span-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{t("REQUIREMENTS")}</span>
        <Button size="sm" type="button" variant="outline" onClick={() => append({ title: "", content: "" })}>
          <Plus aria-hidden="true" className="size-4" />
          {t("REQUIREMENT_ADD")}
        </Button>
      </div>
      {fields.map((field, index) => (
        <div className="grid grid-cols-[160px_1fr_auto] gap-2" key={field.id}>
          <Input aria-label={t("REQUIREMENT_TITLE")} {...form.register(`requirements.${index}.title`)} />
          <Input aria-label={t("REQUIREMENT_CONTENT")} {...form.register(`requirements.${index}.content`)} />
          <Button
            aria-label={t("REQUIREMENT_REMOVE")}
            size="icon"
            type="button"
            variant="ghost"
            onClick={() => remove(index)}
          >
            <Trash2 aria-hidden="true" className="size-4" />
          </Button>
        </div>
      ))}
    </div>
  );
}

type PlanFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan: PackagingPlanDetailDto | null;
  onCreated?: (plan: PackagingPlanDetailDto) => void;
};

export function PlanFormDialog({ open, onOpenChange, plan, onCreated }: PlanFormDialogProps) {
  const { t } = useTranslation("packaging");
  const orders = usePackagingOrderOptionsQuery(open && !plan);
  const create = useCreatePlanMutation();
  const update = useUpdatePlanMutation(plan?.id ?? "none");
  const revising = plan?.status === "CONFIRMED";

  const schema = useMemo(
    () =>
      z
        .object({
          orderId: z.string(),
          title: z.string().trim().max(120),
          method: z.string().trim().min(1, t("REQUIRED")).max(120),
          pairsPerCarton: z.coerce.number().int().min(1, t("PAIRS_PER_CARTON_RULE")).max(10000),
          cartonSize: z.string().max(60),
          cartonType: z.string().max(200),
          strength: z.string().max(60),
          shippingMark: z.string().max(200),
          markPosition: z.string().max(200),
          sizeSticker: z.string().max(200),
          sealSticker: z.string().max(200),
          innerBag: z.string().max(200),
          tape: z.string().max(200),
          destination: z.string().max(200),
          requirements: z.array(z.object({ title: z.string().trim().max(60), content: z.string().trim().max(2000) })),
          changeNote: z.string().trim().max(300),
        })
        .refine((v) => plan !== null || v.orderId !== "", { path: ["orderId"], message: t("REQUIRED") })
        .refine((v) => !revising || v.changeNote !== "", { path: ["changeNote"], message: t("CHANGE_NOTE_REQUIRED") }),
    [t, plan, revising],
  ) as unknown as z.ZodType<FormValues>;

  const defaults = useMemo<FormValues>(
    () => ({
      orderId: "",
      title: plan?.title ?? "",
      method: plan?.method ?? "",
      pairsPerCarton: plan?.pairsPerCarton ?? 120,
      cartonSize: plan?.cartonSize ?? "",
      cartonType: plan?.cartonType ?? "",
      strength: plan?.strength ?? "",
      shippingMark: plan?.shippingMark ?? "",
      markPosition: plan?.markPosition ?? "",
      sizeSticker: plan?.sizeSticker ?? "",
      sealSticker: plan?.sealSticker ?? "",
      innerBag: plan?.innerBag ?? "",
      tape: plan?.tape ?? "",
      destination: plan?.destination ?? "",
      requirements: plan?.requirements ?? [],
      changeNote: "",
    }),
    [plan],
  );

  const orderOptions = [
    { value: "", label: t("ORDER_PICK") },
    ...(orders.data?.items ?? []).map((o) => ({ value: o.id, label: `${o.poNo} · ${o.customerName}` })),
  ];

  return (
    <FormDialog
      defaultValues={defaults}
      open={open}
      schema={schema}
      title={!plan ? t("PLAN_NEW") : revising ? t("PLAN_REVISE") : t("PLAN_EDIT")}
      width="lg"
      onOpenChange={onOpenChange}
      onSubmit={async (values) => {
        const fields = {
          title: values.title || values.method,
          method: values.method,
          pairsPerCarton: values.pairsPerCarton,
          ...Object.fromEntries(TEXT_FIELDS.map((f) => [f, values[f] || null])),
          requirements: values.requirements.filter((r) => r.title),
        };
        if (!plan) {
          const created = await create.mutateAsync({ ...fields, orderId: values.orderId });
          onCreated?.(created);
          return created;
        }
        return update.mutateAsync({ ...fields, version: plan.version, changeNote: values.changeNote || null });
      }}
    >
      {(form) => (
        <div className="grid gap-4 sm:grid-cols-2">
          {revising ? (
            <p className="text-sm text-warning sm:col-span-2">
              {t("REVISE_HINT", { version: (plan?.currentVersion ?? 0) + 1 })}
            </p>
          ) : null}
          {!plan ? (
            <FormFieldSelect
              error={form.formState.errors.orderId?.message}
              label={t("ORDER")}
              name="orderId"
              options={orderOptions}
              register={form.register}
            />
          ) : null}
          <FormFieldText
            error={form.formState.errors.method?.message}
            label={t("F_method")}
            name="method"
            register={form.register}
          />
          <FormFieldText label={t("F_title")} name="title" register={form.register} />
          <FormFieldText
            error={form.formState.errors.pairsPerCarton?.message}
            label={t("F_pairsPerCarton")}
            name="pairsPerCarton"
            register={form.register}
            type="number"
          />
          {TEXT_FIELDS.map((f) => (
            <FormFieldText key={f} label={t(`F_${f}`)} name={f} register={form.register} />
          ))}
          <RequirementsEditor form={form} />
          {plan ? (
            <div className="sm:col-span-2">
              <FormFieldTextarea
                error={form.formState.errors.changeNote?.message}
                label={revising ? t("CHANGE_NOTE_REQ") : t("CHANGE_NOTE")}
                name="changeNote"
                register={form.register}
                rows={2}
              />
            </div>
          ) : null}
        </div>
      )}
    </FormDialog>
  );
}
