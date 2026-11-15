import type { CostBreakdownDto, CostCategory, StrategyParams } from "@otd/contracts/quote";
import { QUOTE_TARGET_TOLERANCE } from "@otd/contracts/quote";
import { marginRate, round } from "@otd/shared";

export type CostLine = { category: CostCategory; amount: number };

export function lineAmount(item: { quantity?: number | null; unitPrice?: number | null; amount?: number }): number {
  if (item.amount !== undefined) return round(item.amount, 4);
  return round((item.quantity ?? 0) * (item.unitPrice ?? 0), 4);
}

export function computeCost(lines: CostLine[], params: Pick<StrategyParams, "lossRate" | "overheadRate">): { costTotal: number; breakdown: CostBreakdownDto } {
  const sum = (c: CostCategory) => lines.filter((l) => l.category === c).reduce((acc, l) => acc + l.amount, 0);
  const yarnRaw = round(sum("YARN"), 4);
  const laborRaw = round(sum("LABOR"), 4);
  const yarn = round(yarnRaw * (1 + params.lossRate), 2);
  const labor = round(laborRaw * (1 + params.overheadRate), 2);
  const trims = round(sum("TRIMS"), 2);
  const other = round(sum("OTHER"), 2);
  return {
    costTotal: round(yarn + labor + trims + other, 2),
    breakdown: { yarn, yarnRaw, yarnLossRate: params.lossRate, labor, laborRaw, overheadRate: params.overheadRate, trims, other },
  };
}

export function suggestPrice(cost: number, params: StrategyParams, quantity: number) {
  const base = params.method === "MARGIN" ? cost / (1 - params.targetMargin) : cost * (1 + params.markupRate);
  const belowMoq = params.moq > 0 && quantity < params.moq;
  const upliftRate = belowMoq ? params.smallOrderUplift : 0;
  const lifted = base * (1 + upliftRate);
  const skuAmount = round(quantity * lifted, 2);
  const tier = [...params.skuTiers].sort((a, b) => b.minAmount - a.minAmount).find((t) => skuAmount >= t.minAmount);
  const discountRate = tier?.discount ?? 0;
  const suggestedPrice = round(lifted * (1 - discountRate), 2);
  return { basePrice: round(base, 2), upliftRate, skuAmount, discountRate, suggestedPrice, priceUsd: toUsd(suggestedPrice, params.lockedFx) };
}

export function toUsd(priceCny: number, fx: number): number {
  return round(priceCny / fx, 2);
}

export function checkPrice(input: { priceCny: number; cost: number; params: StrategyParams; quantity: number; targetPriceUsd: number | null; canOverride: boolean }) {
  const priceUsd = toUsd(input.priceCny, input.params.lockedFx);
  const margin = marginRate(input.priceCny, input.cost);
  const guardrailPassed = margin >= input.params.guardrail;
  const diffToTargetUsd = input.targetPriceUsd == null ? null : round(priceUsd - input.targetPriceUsd, 2);
  const overTargetTolerance = input.targetPriceUsd != null && priceUsd > input.targetPriceUsd * (1 + QUOTE_TARGET_TOLERANCE);
  return {
    priceCny: round(input.priceCny, 2),
    priceUsd,
    margin,
    guardrail: input.params.guardrail,
    guardrailPassed,
    targetMargin: input.params.targetMargin,
    targetMarginMet: margin >= input.params.targetMargin,
    moq: input.params.moq,
    belowMoq: input.params.moq > 0 && input.quantity < input.params.moq,
    targetPriceUsd: input.targetPriceUsd,
    diffToTargetUsd,
    overTargetTolerance,
    canOverride: input.canOverride,
    canSubmit: guardrailPassed || input.canOverride,
  };
}

export function pct(rate: number): string {
  return `${round(rate * 100, 1).toFixed(1)}%`;
}
