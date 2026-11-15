import { useTranslation } from "react-i18next";

import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

type MoneyProps = {
  amount: number | null | undefined;
  currency?: string;
  className?: string;
  negativeDanger?: boolean;
};

export function Money({ amount, currency = "CNY", className, negativeDanger = false }: MoneyProps) {
  const { i18n } = useTranslation();
  return (
    <span
      className={cn(
        "tabular whitespace-nowrap",
        negativeDanger && amount != null && amount < 0 && "text-danger",
        className,
      )}
    >
      {formatMoney(amount, currency, i18n.language)}
    </span>
  );
}
