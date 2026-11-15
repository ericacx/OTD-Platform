import { Plus, Trash2 } from "lucide-react";
import { useMemo } from "react";
import { useFieldArray, type UseFormReturn } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import { FormDialog } from "@/components/biz/form-dialog";
import { FormFieldDate } from "@/components/form/form-field-date";
import { FormFieldSelect } from "@/components/form/form-field-select";
import { FormFieldText } from "@/components/form/form-field-text";
import { FormFieldTextarea } from "@/components/form/form-field-textarea";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/date";

import { useCreatePurchaseMutation } from "../purchase.mutations";
import { useMaterialsQuery, usePurchaseOrderOptionsQuery } from "../purchase.queries";
import {
  PURCHASE_CATEGORIES,
  type PurchaseCategory,
  type PurchaseDetailDto,
  type PurchaseMaterialDto,
} from "../purchase.types";

type LineValues = { materialId: string; name: string; spec: string; quantity: number; unit: string; unitPrice: string };

type FormValues = {
  orderId: string;
  supplier: string;
  category: PurchaseCategory;
  orderedAt: string;
  promisedDate: string;
  deliveryPlace: string;
  note: string;
  lines: LineValues[];
};

export type PurchaseDraft = {
  orderId?: string;
  category?: PurchaseCategory;
  supplier?: string;
  lines?: Partial<LineValues>[];
};

const emptyLine: LineValues = { materialId: "", name: "", spec: "", quantity: 1, unit: "", unitPrice: "" };

function LinesEditor({ form, materials }: { form: UseFormReturn<FormValues>; materials: PurchaseMaterialDto[] }) {
  const { t } = useTranslation("purchase");
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "lines" });
  const errors = form.formState.errors.lines;
  return (
    <div className="space-y-2 sm:col-span-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{t("LINES")}</span>
        <Button size="sm" type="button" variant="outline" onClick={() => append(emptyLine)}>
          <Plus aria-hidden="true" className="size-4" />
          {t("LINE_ADD")}
        </Button>
      </div>
      <div className="grid grid-cols-[1.4fr_1.2fr_0.8fr_0.7fr_0.6fr_0.7fr_auto] gap-2 text-xs text-muted-foreground">
        <span>{t("MATERIAL")}</span>
        <span>{t("LINE_NAME")}</span>
        <span>{t("SPEC")}</span>
        <span>{t("QUANTITY")}</span>
        <span>{t("UNIT")}</span>
        <span>{t("UNIT_PRICE")}</span>
        <span />
      </div>
      {fields.map((field, index) => {
        const lineError = errors?.[index]?.name?.message ?? errors?.[index]?.quantity?.message;
        return (
          <div className="space-y-1" key={field.id}>
            <div className="grid grid-cols-[1.4fr_1.2fr_0.8fr_0.7fr_0.6fr_0.7fr_auto] gap-2">
              <select
                aria-label={t("MATERIAL")}
                className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
                {...form.register(`lines.${index}.materialId`, {
                  onChange: (event: { target: { value: string } }) => {
                    const mat = materials.find((m) => m.id === event.target.value);
                    if (!mat) return;
                    form.setValue(`lines.${index}.name`, mat.name);
                    form.setValue(`lines.${index}.spec`, mat.spec ?? "");
                    form.setValue(`lines.${index}.unit`, mat.unit);
                    form.setValue(`lines.${index}.unitPrice`, mat.unitPrice === null ? "" : String(mat.unitPrice));
                  },
                })}
              >
                <option value="">{t("MATERIAL_NONE")}</option>
                {materials.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.code} · {m.name}
                  </option>
                ))}
              </select>
              <Input
                aria-invalid={Boolean(errors?.[index]?.name) || undefined}
                aria-label={t("LINE_NAME")}
                {...form.register(`lines.${index}.name`)}
              />
              <Input aria-label={t("SPEC")} {...form.register(`lines.${index}.spec`)} />
              <Input
                aria-invalid={Boolean(errors?.[index]?.quantity) || undefined}
                aria-label={t("QUANTITY")}
                step="any"
                type="number"
                {...form.register(`lines.${index}.quantity`)}
              />
              <Input aria-label={t("UNIT")} {...form.register(`lines.${index}.unit`)} />
              <Input
                aria-label={t("UNIT_PRICE")}
                step="any"
                type="number"
                {...form.register(`lines.${index}.unitPrice`)}
              />
              <Button
                aria-label={t("LINE_REMOVE")}
                disabled={fields.length === 1}
                size="icon"
                type="button"
                variant="ghost"
                onClick={() => remove(index)}
              >
                <Trash2 aria-hidden="true" className="size-4" />
              </Button>
            </div>
            {lineError ? (
              <p className="text-xs font-medium text-destructive" role="alert">
                {lineError}
              </p>
            ) : null}
          </div>
        );
      })}
      {errors?.root?.message || errors?.message ? (
        <p className="text-sm font-medium text-destructive" role="alert">
          {errors.root?.message ?? errors.message}
        </p>
      ) : null}
    </div>
  );
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draft?: PurchaseDraft | null;
  onCreated?: (purchase: PurchaseDetailDto) => void;
};

export function PurchaseFormDialog({ open, onOpenChange, draft, onCreated }: Props) {
  const { t } = useTranslation("purchase");
  const orders = usePurchaseOrderOptionsQuery(open);
  const materials = useMaterialsQuery(open);
  const create = useCreatePurchaseMutation();
  const today = formatDate(new Date());

  const schema = useMemo(
    () =>
      z.object({
        orderId: z.string().min(1, t("REQUIRED")),
        supplier: z.string().trim().min(1, t("REQUIRED")).max(120),
        category: z.enum(PURCHASE_CATEGORIES),
        orderedAt: z.string().min(1, t("REQUIRED")),
        promisedDate: z.string().min(1, t("REQUIRED")),
        deliveryPlace: z.string().trim().max(120),
        note: z.string().trim().max(500),
        lines: z
          .array(
            z
              .object({
                materialId: z.string(),
                name: z.string().trim().max(120),
                spec: z.string().trim().max(120),
                quantity: z.coerce.number().positive(t("QUANTITY_RULE")),
                unit: z.string().trim().max(20),
                unitPrice: z.string(),
              })
              .refine((l) => l.materialId !== "" || (l.name !== "" && l.unit !== ""), {
                message: t("LINE_NAME_RULE"),
                path: ["name"],
              }),
          )
          .min(1),
      }) as unknown as z.ZodType<FormValues>,
    [t],
  );

  const defaults = useMemo<FormValues>(
    () => ({
      orderId: draft?.orderId ?? "",
      supplier: draft?.supplier ?? "",
      category: draft?.category ?? "YARN",
      orderedAt: today,
      promisedDate: "",
      deliveryPlace: "",
      note: "",
      lines: draft?.lines?.length ? draft.lines.map((l) => ({ ...emptyLine, ...l })) : [emptyLine],
    }),
    [draft, today],
  );

  return (
    <FormDialog
      defaultValues={defaults}
      open={open && !orders.isLoading && !materials.isLoading}
      schema={schema}
      title={t("PURCHASE_NEW")}
      width="lg"
      onOpenChange={onOpenChange}
      onSubmit={async (values) => {
        const created = await create.mutateAsync({
          orderId: values.orderId,
          supplier: values.supplier,
          category: values.category,
          orderedAt: values.orderedAt,
          promisedDate: values.promisedDate,
          deliveryPlace: values.deliveryPlace || null,
          note: values.note || null,
          lines: values.lines.map((l) => ({
            materialId: l.materialId || null,
            name: l.name || null,
            spec: l.spec || null,
            quantity: Number(l.quantity),
            unit: l.unit || null,
            unitPrice: l.unitPrice === "" ? null : Number(l.unitPrice),
          })),
        });
        onCreated?.(created);
        return created;
      }}
    >
      {(form) => (
        <div className="grid gap-4 sm:grid-cols-2">
          <FormFieldSelect
            error={form.formState.errors.orderId?.message}
            label={t("ORDER")}
            name="orderId"
            options={[
              { value: "", label: t("ORDER_PICK") },
              ...(orders.data?.items ?? []).map((o) => ({ value: o.id, label: `${o.poNo} · ${o.customerName}` })),
            ]}
            register={form.register}
          />
          <FormFieldSelect
            label={t("CATEGORY")}
            name="category"
            options={PURCHASE_CATEGORIES.map((c) => ({ value: c, label: t(`CAT_${c}`) }))}
            register={form.register}
          />
          <FormFieldText
            error={form.formState.errors.supplier?.message}
            label={t("SUPPLIER")}
            name="supplier"
            register={form.register}
          />
          <FormFieldText label={t("DELIVERY_PLACE")} name="deliveryPlace" register={form.register} />
          <FormFieldDate
            error={form.formState.errors.orderedAt?.message}
            label={t("ORDERED_AT")}
            name="orderedAt"
            register={form.register}
          />
          <FormFieldDate
            error={form.formState.errors.promisedDate?.message}
            label={t("PROMISED_DATE")}
            name="promisedDate"
            register={form.register}
          />
          <LinesEditor form={form} materials={materials.data ?? []} />
          <div className="sm:col-span-2">
            <FormFieldTextarea label={t("NOTE")} name="note" register={form.register} rows={2} />
          </div>
        </div>
      )}
    </FormDialog>
  );
}
