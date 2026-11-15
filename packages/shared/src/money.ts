export const CURRENCIES = ["USD", "EUR", "JPY", "CNY", "GBP", "HKD"] as const;
export type Currency = (typeof CURRENCIES)[number];

export function round(value: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round((value + Number.EPSILON) * f) / f;
}

export function marginRate(price: number, cost: number): number {
  if (price <= 0) return 0;
  return round((price - cost) / price, 4);
}

export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
