import { type DbOrTx, type RuleCheckItem, type UnmatchedOrderLine, exchangeRates, handoverPackages, quoteRounds, quotes, styles } from "@otd/db";
import { and, desc, eq, inArray, lte } from "drizzle-orm";

export type RuleCheckInput = {
  totalPairs: number;
  orderDate: string | null;
  customerDueDate: string;
  factoryId: string | null;
  currency: string;
  lines: { styleId: string; quantity: number; unitPrice: number | null }[];
  unmatched: UnmatchedOrderLine[];
};

export const MIN_LEAD_DAYS = 30;
export const PRICE_TOLERANCE = 0.03;

export type RuleCheckOptions = { minLeadDays: number; priceTolerance: number };

export function ruleCheckOptions(params: Record<string, unknown> = {}): RuleCheckOptions {
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);
  const pct = num(params.priceTolerancePct);
  return { minLeadDays: num(params.minLeadDays) ?? MIN_LEAD_DAYS, priceTolerance: pct !== null ? pct / 100 : PRICE_TOLERANCE };
}

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

const pct = (v: number) => `${(Math.round(v * 1000) / 10).toFixed(1)}%`;

export async function runRuleCheck(db: DbOrTx, input: RuleCheckInput, today: string, options: RuleCheckOptions = { minLeadDays: MIN_LEAD_DAYS, priceTolerance: PRICE_TOLERANCE }): Promise<RuleCheckItem[]> {
  const styleIds = [...new Set(input.lines.map((l) => l.styleId))];
  const styleRows = styleIds.length ? await db.select({ id: styles.id, styleNo: styles.styleNo }).from(styles).where(inArray(styles.id, styleIds)) : [];
  const styleNo = new Map(styleRows.map((s) => [s.id, s.styleNo]));
  const items: RuleCheckItem[] = [];

  const handovers = styleIds.length ? await db.select({ styleId: handoverPackages.styleId, status: handoverPackages.status }).from(handoverPackages).where(inArray(handoverPackages.styleId, styleIds)) : [];
  const notHanded = styleIds.filter((id) => !handovers.some((h) => h.styleId === id && h.status === "HANDED_OVER")).map((id) => `#${styleNo.get(id) ?? id}`);
  const unmatched = [...new Set(input.unmatched.map((u) => `#${u.styleNo}`))];
  const handDetail = [notHanded.length ? `未完成开发移交：${notHanded.join("、")}` : "", unmatched.length ? `未关联开发资料：${unmatched.join("、")}` : "", !styleIds.length && !unmatched.length ? "订单没有明细行" : ""].filter(Boolean).join("；");
  items.push({ key: "stylesHandedOver", label: { zh: "款号均已完成开发移交", en: "All styles handed over" }, passed: !handDetail, ...(handDetail ? { detail: handDetail } : { detail: `${styleIds.length} 款均已移交` }) });

  const lineTotal = input.lines.reduce((s, l) => s + l.quantity, 0) + input.unmatched.reduce((s, l) => s + l.quantity, 0);
  items.push({ key: "quantityMatches", label: { zh: "明细数量合计等于总双数", en: "Line quantities match total pairs" }, passed: lineTotal === input.totalPairs && lineTotal > 0, detail: `明细合计 ${lineTotal.toLocaleString("en-US")} 双，总双数 ${input.totalPairs.toLocaleString("en-US")} 双` });

  const orderDate = input.orderDate ?? today;
  const lead = daysBetween(orderDate, input.customerDueDate);
  items.push({ key: "leadTime", label: { zh: `客户交期不早于下单日 + ${options.minLeadDays} 天`, en: `Due date at least ${options.minLeadDays} days after order date` }, passed: lead >= options.minLeadDays, detail: `下单日 ${orderDate}，客户交期 ${input.customerDueDate}，相差 ${lead} 天` });

  items.push(await priceCheck(db, input, styleIds, styleNo, today, options.priceTolerance));

  items.push({ key: "factoryAssigned", label: { zh: "承做工厂已指定", en: "Factory assigned" }, passed: !!input.factoryId, ...(input.factoryId ? {} : { detail: "未指定承做工厂" }) });
  return items;
}

async function priceCheck(db: DbOrTx, input: RuleCheckInput, styleIds: string[], styleNo: Map<string, string>, today: string, tolerance: number): Promise<RuleCheckItem> {
  const label = { zh: `单价与已接受报价偏差不超过 ${Math.round(tolerance * 1000) / 10}%`, en: `Unit price within ${Math.round(tolerance * 1000) / 10}% of accepted quote` };
  const accepted = styleIds.length
    ? await db
        .select({ styleId: quotes.styleId, priceUsd: quoteRounds.priceUsd, priceCny: quoteRounds.priceCny, roundNo: quoteRounds.roundNo, docNo: quoteRounds.docNo })
        .from(quoteRounds)
        .innerJoin(quotes, eq(quotes.id, quoteRounds.quoteId))
        .where(and(inArray(quotes.styleId, styleIds), eq(quoteRounds.kind, "CUSTOMER"), eq(quoteRounds.status, "ACCEPTED")))
        .orderBy(desc(quoteRounds.roundNo))
    : [];
  let rate: number | null = null;
  if (input.currency !== "USD" && input.currency !== "CNY") {
    const r = (await db.select({ rate: exchangeRates.rateToCny }).from(exchangeRates).where(and(eq(exchangeRates.currency, input.currency), lte(exchangeRates.effectiveDate, today))).orderBy(desc(exchangeRates.effectiveDate)).limit(1))[0];
    rate = r?.rate ?? null;
  }
  const failures: string[] = [];
  const notes: string[] = [];
  for (const id of styleIds) {
    const quote = accepted.find((a) => a.styleId === id);
    const no = `#${styleNo.get(id) ?? id}`;
    if (!quote) {
      notes.push(`${no} 无已接受报价，未比对`);
      continue;
    }
    const ref = input.currency === "USD" ? quote.priceUsd : input.currency === "CNY" ? quote.priceCny : rate ? quote.priceCny / rate : null;
    if (!ref) {
      notes.push(`${no} 缺少 ${input.currency} 汇率，未比对`);
      continue;
    }
    for (const line of input.lines.filter((l) => l.styleId === id && l.unitPrice !== null)) {
      const dev = Math.abs(line.unitPrice! - ref) / ref;
      if (dev > tolerance + 1e-9) {
        failures.push(`${no} 单价 ${line.unitPrice} 与报价 ${quote.docNo} ${Math.round(ref * 10000) / 10000} 偏差 ${pct(dev)}`);
        break;
      }
    }
  }
  if (failures.length) return { key: "priceMatchesQuote", label, passed: false, detail: [...new Set(failures)].join("；") };
  return { key: "priceMatchesQuote", label, passed: true, detail: notes.length ? `${notes.join("；")}（提示，不阻断）` : "单价与已接受报价一致" };
}
