const ZERO_DECIMAL = new Set(["JPY", "KRW", "VND"]);

export function formatNumber(value: number | null | undefined, digits = 0, locale = "zh-CN"): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
}

export function formatMoney(amount: number | null | undefined, currency = "CNY", locale = "zh-CN"): string {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return "—";
  const digits = ZERO_DECIMAL.has(currency) ? 0 : 2;
  return `${currency} ${formatNumber(amount, digits, locale)}`;
}

export function formatPercent(rate: number | null | undefined, digits = 1): string {
  if (rate === null || rate === undefined || Number.isNaN(rate)) return "—";
  return `${(rate * 100).toFixed(digits)}%`;
}
