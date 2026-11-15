import { useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

import { useOrderDetailQuery, useOrderOptionsQuery } from "../inspection.queries";

const SELECT_CLASS =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

type OrderPickerProps = {
  value: string;
  onChange: (orderId: string) => void;
  error?: string | undefined;
};

export function OrderPicker({ value, onChange, error }: OrderPickerProps) {
  const { t } = useTranslation("inspection");
  const id = useId();
  const [keyword, setKeyword] = useState("");
  const options = useOrderOptionsQuery(keyword.trim());
  const items = options.data?.items ?? [];
  return (
    <div className="space-y-1.5 sm:col-span-2">
      <Label className={cn(error && "text-destructive")} htmlFor={id}>
        {t("ORDER_PICK")}
      </Label>
      <div className="grid gap-2 sm:grid-cols-[200px_1fr]">
        <Input
          aria-label={t("ORDER_SEARCH")}
          placeholder={t("ORDER_SEARCH")}
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
        />
        <select
          aria-invalid={Boolean(error) || undefined}
          className={SELECT_CLASS}
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">{options.isLoading ? t("ORDER_LOADING") : t("ORDER_PLACEHOLDER")}</option>
          {items.map((o) => (
            <option key={o.id} value={o.id}>
              {`${o.poNo} · ${o.customerName} · ${o.styleNos.map((s) => `#${s}`).join(" ")}`}
            </option>
          ))}
        </select>
      </div>
      {error ? (
        <p className="text-sm font-medium text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

type StylePickerProps = {
  orderId: string;
  value: string;
  onChange: (styleId: string) => void;
  allowAll?: boolean;
};

export function StylePicker({ orderId, value, onChange, allowAll = true }: StylePickerProps) {
  const { t } = useTranslation("inspection");
  const id = useId();
  const detail = useOrderDetailQuery(orderId || null);
  const styles = useMemo(() => {
    const seen = new Map<string, string>();
    for (const line of detail.data?.lines ?? []) {
      if (!seen.has(line.styleId))
        seen.set(line.styleId, `#${line.styleNo}${line.styleName ? ` ${line.styleName}` : ""}`);
    }
    return [...seen.entries()];
  }, [detail.data]);
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{t("STYLE")}</Label>
      <select
        className={SELECT_CLASS}
        disabled={!orderId}
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {allowAll ? <option value="">{t("STYLE_ALL")}</option> : null}
        {styles.map(([styleId, label]) => (
          <option key={styleId} value={styleId}>
            {label}
          </option>
        ))}
      </select>
    </div>
  );
}
