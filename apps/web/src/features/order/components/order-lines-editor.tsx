import { Plus, Trash2 } from "lucide-react";
import { useMemo } from "react";
import { useFieldArray, useWatch, type Control, type FieldErrors, type UseFormRegister } from "react-hook-form";
import { useTranslation } from "react-i18next";

import { Money } from "@/components/biz/money";
import { Button } from "@/components/ui/button";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

import { useStyleOptionsQuery } from "../../planning/planning.queries";

import { EMPTY_LINE, type OrderFormValues } from "./order-form.types";

export type { LineValues } from "./order-form.types";

const CELL = "h-8 w-full rounded-md border border-input bg-card px-2 text-sm";

type OrderLinesEditorProps = {
  control: Control<OrderFormValues>;
  register: UseFormRegister<OrderFormValues>;
  errors: FieldErrors<OrderFormValues> | undefined;
  customerId: string;
  currency: string;
};

export function OrderLinesEditor({ control, register, errors, customerId, currency }: OrderLinesEditorProps) {
  const { t, i18n } = useTranslation("order");
  const { fields, append, remove } = useFieldArray({ control, name: "lines" });
  const lines = useWatch({ control, name: "lines" });
  const styles = useStyleOptionsQuery({ customerId: customerId || undefined });
  const options = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of styles.data ?? [])
      if (!customerId || s.customerId === customerId) map.set(s.id, `#${s.styleNo} ${s.nameZh}`);
    for (const l of lines ?? []) if (l.styleId && !map.has(l.styleId)) map.set(l.styleId, `#${l.styleNo}`);
    return [...map.entries()].map(([value, label]) => ({ value, label }));
  }, [styles.data, lines, customerId]);
  const totals = useMemo(() => {
    let pairs = 0;
    let amount = 0;
    let priced = false;
    for (const l of lines ?? []) {
      const q = Number(l.quantity) || 0;
      pairs += q;
      if (l.unitPrice !== "" && !Number.isNaN(Number(l.unitPrice))) {
        amount += q * Number(l.unitPrice);
        priced = true;
      }
    }
    return { pairs, amount: priced ? Math.round(amount * 100) / 100 : null };
  }, [lines]);
  const rootError = errors?.lines?.root?.message ?? errors?.lines?.message;

  if (!customerId) return <p className="text-sm text-muted-foreground">{t("LINES_PICK_CUSTOMER")}</p>;

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th className="w-[30%] pb-1.5 font-medium">{t("L_STYLE")}</th>
              <th className="pb-1.5 font-medium">{t("L_COLOR")}</th>
              <th className="pb-1.5 font-medium">{t("L_SIZE")}</th>
              <th className="pb-1.5 font-medium">{t("L_SKU")}</th>
              <th className="w-[96px] pb-1.5 font-medium">{t("L_QTY")}</th>
              <th className="w-[96px] pb-1.5 font-medium">{t("L_PRICE")}</th>
              <th className="w-10 pb-1.5" />
            </tr>
          </thead>
          <tbody>
            {fields.map((field, index) => {
              const rowErrors = errors?.lines?.[index];
              return (
                <tr className="align-top" data-testid="order-line" key={field.id}>
                  <td className="py-1 pr-2">
                    <select
                      aria-invalid={rowErrors?.styleId ? true : undefined}
                      aria-label={`${t("L_STYLE")} ${index + 1}`}
                      className={cn(CELL, rowErrors?.styleId && "border-destructive")}
                      {...register(`lines.${index}.styleId`)}
                    >
                      <option value="">{t("LINE_STYLE_PH")}</option>
                      {options.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    {field.hint ? (
                      <p className="mt-1 text-xs text-warning">{t("LINE_UNMATCHED_HINT", { no: field.hint })}</p>
                    ) : null}
                    {rowErrors?.styleId?.message ? (
                      <p className="mt-1 text-xs text-destructive">{t(rowErrors.styleId.message as never)}</p>
                    ) : null}
                  </td>
                  <td className="py-1 pr-2">
                    <input
                      aria-label={`${t("L_COLOR")} ${index + 1}`}
                      className={CELL}
                      {...register(`lines.${index}.color`)}
                    />
                  </td>
                  <td className="py-1 pr-2">
                    <input
                      aria-label={`${t("L_SIZE")} ${index + 1}`}
                      className={CELL}
                      {...register(`lines.${index}.size`)}
                    />
                  </td>
                  <td className="py-1 pr-2">
                    <input
                      aria-label={`${t("L_SKU")} ${index + 1}`}
                      className={CELL}
                      {...register(`lines.${index}.sku`)}
                    />
                  </td>
                  <td className="py-1 pr-2">
                    <input
                      aria-invalid={rowErrors?.quantity ? true : undefined}
                      aria-label={`${t("L_QTY")} ${index + 1}`}
                      className={cn(CELL, "tabular", rowErrors?.quantity && "border-destructive")}
                      inputMode="numeric"
                      {...register(`lines.${index}.quantity`)}
                    />
                  </td>
                  <td className="py-1 pr-2">
                    <input
                      aria-invalid={rowErrors?.unitPrice ? true : undefined}
                      aria-label={`${t("L_PRICE")} ${index + 1}`}
                      className={cn(CELL, "tabular", rowErrors?.unitPrice && "border-destructive")}
                      inputMode="decimal"
                      {...register(`lines.${index}.unitPrice`)}
                    />
                  </td>
                  <td className="py-1">
                    <Button
                      aria-label={`${t("LINE_REMOVE")} ${index + 1}`}
                      className="size-8"
                      disabled={fields.length <= 1}
                      size="icon"
                      type="button"
                      variant="ghost"
                      onClick={() => remove(index)}
                    >
                      <Trash2 aria-hidden="true" className="size-4" />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button size="sm" type="button" variant="outline" onClick={() => append({ ...EMPTY_LINE })}>
          <Plus aria-hidden="true" className="size-3.5" />
          {t("LINE_ADD")}
        </Button>
        <span className="text-sm text-muted-foreground">
          {t("LINES_TOTAL", { pairs: formatNumber(totals.pairs, 0, i18n.language) })} ·{" "}
          <Money amount={totals.amount} currency={currency || "USD"} />
        </span>
      </div>
      {rootError ? <p className="text-xs text-destructive">{t(rootError as never)}</p> : null}
    </div>
  );
}
