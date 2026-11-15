import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

import { yuan } from "../quote.format";
import { useUpdateQuoteMutation } from "../quote.mutations";

import type { CostCategory, CostItemInput, QuoteDto } from "../quote.types";

type Row = {
  key: number;
  category: CostCategory;
  name: string;
  spec: string;
  quantity: string;
  unitPrice: string;
  amount: string;
};

const CATEGORIES: CostCategory[] = ["YARN", "LABOR", "TRIMS", "OTHER"];

function toNumber(value: string): number | null {
  return value.trim() === "" || Number.isNaN(Number(value)) ? null : Number(value);
}

function rowAmount(row: Row): number | null {
  const q = toNumber(row.quantity);
  const p = toNumber(row.unitPrice);
  if (q !== null && p !== null) return q * p;
  return toNumber(row.amount);
}

function CostForm({ quote, onDone }: { quote: QuoteDto; onDone: () => void }) {
  const { t } = useTranslation("quote");
  const { t: tc } = useTranslation();
  const update = useUpdateQuoteMutation();
  const [seq, setSeq] = useState(quote.costItems?.length ?? 0);
  const [rows, setRows] = useState<Row[]>(
    (quote.costItems ?? []).map((item, index) => ({
      key: index,
      category: item.category,
      name: item.name,
      spec: item.spec ?? "",
      quantity: item.quantity != null ? String(item.quantity) : "",
      unitPrice: item.unitPrice != null ? String(item.unitPrice) : "",
      amount: String(item.amount),
    })),
  );
  const [error, setError] = useState<string | null>(null);
  const loss = quote.strategy?.lossRate ?? 0;
  const overhead = quote.strategy?.overheadRate ?? 0;
  const sum = (c: CostCategory) =>
    rows.filter((r) => r.category === c).reduce((acc, r) => acc + (rowAmount(r) ?? 0), 0);
  const totals = {
    YARN: sum("YARN") * (1 + loss),
    LABOR: sum("LABOR") * (1 + overhead),
    TRIMS: sum("TRIMS"),
    OTHER: sum("OTHER"),
  };
  const total = Object.values(totals).reduce((a, b) => a + Math.round(b * 100) / 100, 0);
  const invalid = rows.some((r) => !r.name.trim() || rowAmount(r) === null);

  function patch(key: number, change: Partial<Row>) {
    setRows((list) => list.map((r) => (r.key === key ? { ...r, ...change } : r)));
  }

  async function save() {
    setError(null);
    const items: CostItemInput[] = rows.map((r) => {
      const q = toNumber(r.quantity);
      const p = toNumber(r.unitPrice);
      return q !== null && p !== null
        ? { category: r.category, name: r.name.trim(), spec: r.spec.trim() || null, quantity: q, unitPrice: p }
        : { category: r.category, name: r.name.trim(), spec: r.spec.trim() || null, amount: toNumber(r.amount) ?? 0 };
    });
    try {
      await update.mutateAsync({ id: quote.id, input: { costItems: items, version: quote.version } });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : tc("BIZERR"));
    }
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-muted-foreground">
            <tr>
              <th className="h-9 px-2 font-medium">{t("COST_CATEGORY")}</th>
              <th className="px-2 font-medium">{t("COST_NAME")}</th>
              <th className="px-2 font-medium">{t("COST_SPEC")}</th>
              <th className="px-2 font-medium">{t("COST_QTY")}</th>
              <th className="px-2 font-medium">{t("COST_UNIT_PRICE")}</th>
              <th className="px-2 font-medium">{t("COST_AMOUNT")}</th>
              <th className="w-10 px-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const auto = toNumber(row.quantity) !== null && toNumber(row.unitPrice) !== null;
              return (
                <tr className="border-t border-border" key={row.key}>
                  <td className="p-1.5">
                    <select
                      aria-label={`${t("COST_CATEGORY")} ${index + 1}`}
                      className="h-8 rounded-md border border-input bg-transparent px-2 text-sm"
                      value={row.category}
                      onChange={(e) => patch(row.key, { category: e.target.value as CostCategory })}
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {t(`CAT_${c}`)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="p-1.5">
                    <Input
                      aria-label={`${t("COST_NAME")} ${index + 1}`}
                      className="h-8"
                      value={row.name}
                      onChange={(e) => patch(row.key, { name: e.target.value })}
                    />
                  </td>
                  <td className="p-1.5">
                    <Input
                      aria-label={`${t("COST_SPEC")} ${index + 1}`}
                      className="h-8"
                      value={row.spec}
                      onChange={(e) => patch(row.key, { spec: e.target.value })}
                    />
                  </td>
                  <td className="p-1.5">
                    <Input
                      aria-label={`${t("COST_QTY")} ${index + 1}`}
                      className="tabular h-8 w-24"
                      value={row.quantity}
                      onChange={(e) => patch(row.key, { quantity: e.target.value })}
                    />
                  </td>
                  <td className="p-1.5">
                    <Input
                      aria-label={`${t("COST_UNIT_PRICE")} ${index + 1}`}
                      className="tabular h-8 w-24"
                      value={row.unitPrice}
                      onChange={(e) => patch(row.key, { unitPrice: e.target.value })}
                    />
                  </td>
                  <td className="p-1.5">
                    <Input
                      aria-label={`${t("COST_AMOUNT")} ${index + 1}`}
                      className="tabular h-8 w-24"
                      disabled={auto}
                      value={auto ? (rowAmount(row) ?? 0).toFixed(4) : row.amount}
                      onChange={(e) => patch(row.key, { amount: e.target.value })}
                    />
                  </td>
                  <td className="p-1.5">
                    <Button
                      aria-label={tc("jAiN8T")}
                      size="icon"
                      type="button"
                      variant="ghost"
                      onClick={() => setRows((list) => list.filter((r) => r.key !== row.key))}
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
      <Button
        size="sm"
        type="button"
        variant="outline"
        onClick={() => {
          setRows((list) => [
            ...list,
            { key: seq, category: "OTHER", name: "", spec: "", quantity: "", unitPrice: "", amount: "" },
          ]);
          setSeq((n) => n + 1);
        }}
      >
        <Plus aria-hidden="true" className="size-4" />
        {t("COST_ADD")}
      </Button>
      <p className="tabular text-sm text-muted-foreground">
        {t("COST_PREVIEW", {
          yarn: yuan(totals.YARN),
          loss: Math.round(loss * 100),
          labor: yuan(totals.LABOR),
          trims: yuan(totals.TRIMS),
          other: yuan(totals.OTHER),
          total: yuan(total),
        })}
      </p>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          {tc("ZCYE20")}
        </Button>
        <Button disabled={invalid || update.isPending} type="button" onClick={() => void save()}>
          {update.isPending ? tc("SBWT01") : tc("wodHc6")}
        </Button>
      </DialogFooter>
    </div>
  );
}

export function CostItemsDialog({
  quote,
  open,
  onOpenChange,
}: {
  quote: QuoteDto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation("quote");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[960px]">
        <DialogHeader>
          <DialogTitle>{t("COST_EDIT_TITLE", { styleNo: quote.styleNo })}</DialogTitle>
        </DialogHeader>
        {open ? <CostForm quote={quote} onDone={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}
