import type { StrategyParams } from "./quote.types";

export function yuan(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : value.toFixed(2);
}

export function usd(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : `$${value.toFixed(2)}`;
}

export function pct(rate: number | null | undefined, digits = 1): string {
  return rate === null || rate === undefined ? "—" : `${(rate * 100).toFixed(digits)}%`;
}

function wan(amount: number): string {
  return amount >= 10_000 ? `${amount / 10_000}` : String(amount);
}

export function tierText(tiers: StrategyParams["skuTiers"], unit: string): string {
  return [...tiers]
    .sort((a, b) => a.minAmount - b.minAmount)
    .map((tier) => `≥${wan(tier.minAmount)}${unit} -${(tier.discount * 100).toFixed(0)}%`)
    .join(" ｜ ");
}
