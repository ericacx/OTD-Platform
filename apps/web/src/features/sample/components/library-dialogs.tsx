import { LIBRARY_KINDS } from "@otd/contracts/sample";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { z } from "zod";

import { FormDialog } from "@/components/biz/form-dialog";
import { FormFieldDate } from "@/components/form/form-field-date";
import { FormFieldSelect } from "@/components/form/form-field-select";
import { FormFieldText } from "@/components/form/form-field-text";
import { FormFieldTextarea } from "@/components/form/form-field-textarea";
import { useStyleOptionsQuery } from "@/features/planning/planning.queries";

import { useLibraryActionMutation, useSaveLibraryMutation, useSaveMaterialMutation } from "../sample.mutations";
import { useSamplesQuery } from "../sample.queries";

import type { LibraryItemDto } from "../sample.types";

const librarySchema = z.object({
  styleId: z.string().min(1),
  kind: z.enum(LIBRARY_KINDS),
  location: z.string().max(120),
  quantity: z.coerce.number().int().min(1).max(10000),
  note: z.string().max(500),
});

type LibraryDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preset?: { styleId: string; sampleId: string; roundId: string | null; label: string } | undefined;
};

export function LibraryFormDialog({ open, onOpenChange, preset }: LibraryDialogProps) {
  const { t } = useTranslation("sample");
  const save = useSaveLibraryMutation();
  const styles = useStyleOptionsQuery({});
  const styleOptions = preset
    ? [{ value: preset.styleId, label: preset.label }]
    : (styles.data ?? []).map((s) => ({ value: s.id, label: `#${s.styleNo} · ${s.nameZh} · ${s.customerName}` }));
  return (
    <FormDialog
      defaultValues={{ styleId: preset?.styleId ?? "", kind: "QRS" as const, location: "", quantity: 1, note: "" }}
      open={open}
      schema={librarySchema}
      title={t("LIB_NEW")}
      onOpenChange={onOpenChange}
      onSubmit={async (values) => {
        await save.mutateAsync({
          input: {
            styleId: values.styleId,
            kind: values.kind,
            quantity: values.quantity,
            ...(preset ? { sampleId: preset.sampleId, roundId: preset.roundId } : {}),
            ...(values.location.trim() ? { location: values.location.trim() } : {}),
            ...(values.note.trim() ? { note: values.note.trim() } : {}),
          },
        });
        toast.success(t("LIB_SAVED"));
      }}
    >
      {(form) => (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <FormFieldSelect
              disabled={Boolean(preset)}
              error={form.formState.errors.styleId ? t("PICK_STYLE") : undefined}
              label={t("F_STYLE")}
              name="styleId"
              options={[{ value: "", label: t("PICK_STYLE") }, ...styleOptions]}
              register={form.register}
            />
          </div>
          <FormFieldSelect
            label={t("LIB_KIND")}
            name="kind"
            options={LIBRARY_KINDS.map((k) => ({ value: k, label: t(`KIND_${k}`) }))}
            register={form.register}
          />
          <FormFieldText label={t("F_QTY")} name="quantity" register={form.register} type="number" />
          <div className="sm:col-span-2">
            <FormFieldText label={t("LIB_LOCATION")} name="location" register={form.register} />
          </div>
          <div className="sm:col-span-2">
            <FormFieldTextarea label={t("F_NOTE")} name="note" register={form.register} rows={2} />
          </div>
        </div>
      )}
    </FormDialog>
  );
}

const lendSchema = z.object({ borrower: z.string().trim().min(1).max(60) });

export function LendDialog({
  item,
  onOpenChange,
}: {
  item: LibraryItemDto | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation("sample");
  const action = useLibraryActionMutation();
  return (
    <FormDialog
      defaultValues={{ borrower: "" }}
      open={item !== null}
      schema={lendSchema}
      submitLabel={t("LIB_LEND")}
      title={t("LIB_LEND_TITLE", { style: item?.styleNo ?? "" })}
      onOpenChange={onOpenChange}
      onSubmit={async (values) => {
        if (!item) return;
        await action.mutateAsync({
          id: item.id,
          action: "lend",
          input: { borrower: values.borrower, version: item.version },
        });
        toast.success(t("LIB_LENT_OK"));
      }}
    >
      {(form) => (
        <FormFieldText
          error={form.formState.errors.borrower ? t("BORROWER_REQUIRED") : undefined}
          label={t("LIB_BORROWER")}
          name="borrower"
          register={form.register}
        />
      )}
    </FormDialog>
  );
}

const materialSchema = z.object({
  sampleId: z.string().min(1),
  materialName: z.string().trim().min(1).max(120),
  spec: z.string().max(120),
  quantity: z.string(),
  unit: z.string().max(20),
  supplier: z.string().max(120),
  arrivalDate: z.string(),
  note: z.string().max(500),
});

export function MaterialFormDialog({
  open,
  onOpenChange,
  sampleId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sampleId?: string | undefined;
}) {
  const { t } = useTranslation("sample");
  const save = useSaveMaterialMutation();
  const samples = useSamplesQuery({ pageSize: 200 });
  const options = (samples.data?.items ?? []).map((s) => ({
    value: s.id,
    label: `${s.docNo} · #${s.styleNo} ${s.styleNameZh}`,
  }));
  return (
    <FormDialog
      defaultValues={{
        sampleId: sampleId ?? "",
        materialName: "",
        spec: "",
        quantity: "",
        unit: "kg",
        supplier: "",
        arrivalDate: "",
        note: "",
      }}
      open={open}
      schema={materialSchema}
      title={t("MAT_NEW")}
      width="md"
      onOpenChange={onOpenChange}
      onSubmit={async (values) => {
        const qty = Number(values.quantity);
        await save.mutateAsync({
          input: {
            sampleId: values.sampleId,
            materialName: values.materialName,
            ...(values.spec.trim() ? { spec: values.spec.trim() } : {}),
            ...(values.quantity.trim() && Number.isFinite(qty) ? { quantity: qty } : {}),
            ...(values.unit.trim() ? { unit: values.unit.trim() } : {}),
            ...(values.supplier.trim() ? { supplier: values.supplier.trim() } : {}),
            ...(values.arrivalDate ? { arrivalDate: values.arrivalDate } : {}),
            ...(values.note.trim() ? { note: values.note.trim() } : {}),
          },
        });
        toast.success(t("MAT_SAVED"));
      }}
    >
      {(form) => (
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="sm:col-span-3">
            <FormFieldSelect
              disabled={Boolean(sampleId)}
              error={form.formState.errors.sampleId ? t("PICK_SAMPLE") : undefined}
              label={t("F_SAMPLE")}
              name="sampleId"
              options={[{ value: "", label: t("PICK_SAMPLE") }, ...options]}
              register={form.register}
            />
          </div>
          <div className="sm:col-span-2">
            <FormFieldText
              error={form.formState.errors.materialName ? t("MAT_NAME_REQUIRED") : undefined}
              label={t("MAT_NAME")}
              name="materialName"
              register={form.register}
            />
          </div>
          <FormFieldText label={t("MAT_SPEC")} name="spec" register={form.register} />
          <FormFieldText label={t("F_QTY")} name="quantity" register={form.register} />
          <FormFieldText label={t("MAT_UNIT")} name="unit" register={form.register} />
          <FormFieldText label={t("MAT_SUPPLIER")} name="supplier" register={form.register} />
          <FormFieldDate label={t("MAT_ARRIVAL")} name="arrivalDate" register={form.register} />
          <div className="sm:col-span-2">
            <FormFieldText label={t("F_NOTE")} name="note" register={form.register} />
          </div>
        </div>
      )}
    </FormDialog>
  );
}
