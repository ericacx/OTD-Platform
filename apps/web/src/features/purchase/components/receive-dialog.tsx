import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import { FormDialog } from "@/components/biz/form-dialog";
import { FormFieldDate } from "@/components/form/form-field-date";
import { FormFieldSelect } from "@/components/form/form-field-select";
import { FormFieldTextarea } from "@/components/form/form-field-textarea";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/date";

import { useReceivePurchaseMutation } from "../purchase.mutations";

import type { PurchaseDetailDto } from "../purchase.types";

type Values = {
  receivedAt: string;
  qcResult: "PASS" | "FAIL" | "";
  note: string;
  lines: { lineId: string; quantity: string }[];
};

type Props = { purchase: PurchaseDetailDto | null; onOpenChange: (open: boolean) => void };

export function ReceiveDialog({ purchase, onOpenChange }: Props) {
  const { t } = useTranslation("purchase");
  const receive = useReceivePurchaseMutation(purchase?.id ?? "none");
  const open = purchase !== null;
  const lines = useMemo(() => (purchase?.lines ?? []).filter((l) => l.remainingQty > 0), [purchase]);

  const schema = useMemo(
    () =>
      z
        .object({
          receivedAt: z.string().min(1, t("REQUIRED")),
          qcResult: z.enum(["PASS", "FAIL", ""]),
          note: z.string().trim().max(300),
          lines: z.array(z.object({ lineId: z.string(), quantity: z.string() })),
        })
        .superRefine((v, ctx) => {
          let any = false;
          v.lines.forEach((l, i) => {
            if (l.quantity.trim() === "") return;
            const q = Number(l.quantity);
            const line = lines.find((x) => x.id === l.lineId);
            if (!Number.isFinite(q) || q <= 0)
              ctx.addIssue({ code: "custom", path: ["lines", i, "quantity"], message: t("QUANTITY_RULE") });
            else if (line && q > line.remainingQty)
              ctx.addIssue({
                code: "custom",
                path: ["lines", i, "quantity"],
                message: t("RECEIVE_EXCEEDS", { remaining: line.remainingQty }),
              });
            else any = true;
          });
          if (!any) ctx.addIssue({ code: "custom", path: ["lines"], message: t("RECEIVE_EMPTY") });
        }),
    [t, lines],
  );

  if (!purchase) return null;
  return (
    <FormDialog<Values>
      defaultValues={{
        receivedAt: formatDate(new Date()),
        qcResult: "PASS",
        note: "",
        lines: lines.map((l) => ({ lineId: l.id, quantity: "" })),
      }}
      description={t("RECEIVE_DESC", { docNo: purchase.docNo, supplier: purchase.supplier })}
      open={open}
      schema={schema}
      submitLabel={t("RECEIVE_SUBMIT")}
      title={t("ACTION_RECEIVE")}
      width="md"
      onOpenChange={onOpenChange}
      onSubmit={(values) =>
        receive.mutateAsync({
          version: purchase.version,
          receivedAt: values.receivedAt,
          qcResult: values.qcResult || null,
          note: values.note || null,
          lines: values.lines
            .filter((l) => l.quantity.trim() !== "")
            .map((l) => ({ lineId: l.lineId, quantity: Number(l.quantity) })),
        })
      }
    >
      {(form) => (
        <div className="space-y-4">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-1 pr-2 font-medium">{t("LINE_NAME")}</th>
                <th className="py-1 pr-2 text-right font-medium">{t("QUANTITY")}</th>
                <th className="py-1 pr-2 text-right font-medium">{t("RECEIVED")}</th>
                <th className="py-1 pr-2 text-right font-medium">{t("REMAINING")}</th>
                <th className="py-1 font-medium">{t("RECEIVE_NOW")}</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => {
                const error = form.formState.errors.lines?.[i]?.quantity?.message;
                return (
                  <tr className="border-t border-border align-top" key={l.id}>
                    <td className="py-2 pr-2">{l.name}</td>
                    <td className="tabular py-2 pr-2 text-right">{`${l.quantity} ${l.unit}`}</td>
                    <td className="tabular py-2 pr-2 text-right">{l.receivedQty}</td>
                    <td className="tabular py-2 pr-2 text-right">{l.remainingQty}</td>
                    <td className="py-2">
                      <Input
                        aria-invalid={Boolean(error) || undefined}
                        aria-label={t("RECEIVE_QTY_OF", { name: l.name })}
                        className="h-8 w-28"
                        step="any"
                        type="number"
                        {...form.register(`lines.${i}.quantity`)}
                      />
                      {error ? <p className="mt-1 text-xs text-destructive">{error}</p> : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {form.formState.errors.lines?.message ? (
            <p className="text-sm font-medium text-destructive" role="alert">
              {form.formState.errors.lines.message}
            </p>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <FormFieldDate label={t("RECEIVED_AT")} name="receivedAt" register={form.register} />
            <FormFieldSelect
              label={t("QC_RESULT")}
              name="qcResult"
              options={[
                { value: "PASS", label: t("QC_PASS") },
                { value: "FAIL", label: t("QC_FAIL") },
                { value: "", label: t("QC_NONE") },
              ]}
              register={form.register}
            />
          </div>
          <FormFieldTextarea label={t("NOTE")} name="note" register={form.register} rows={2} />
        </div>
      )}
    </FormDialog>
  );
}
