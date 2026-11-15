import { marginRate, quoteNo, round } from "@otd/shared";
import { eq } from "drizzle-orm";
import { type QuoteStrategySnapshot, files, quoteCostItems, quoteRounds, quoteStrategies, quotes, styles } from "../../schema/index.js";
import type { SeedContext } from "./context.js";

type Category = "YARN" | "LABOR" | "TRIMS" | "OTHER";
type Item = [Category, string, string | null, number | null, number | null, number?];
type Round = {
  kind: "INTERNAL" | "CUSTOMER";
  strategy: string;
  quantity: number;
  price?: number;
  status: "COST_REVIEW" | "QUOTED" | "ACCEPTED" | "REJECTED" | "LAPSED";
  day: number;
  feedbackDay?: number;
  feedbackNote?: string;
  note?: string;
};
type QuoteSeed = {
  styleNo: string;
  factory: string | null;
  moq: number | null;
  strategy: string;
  target?: { usd: number; fx: number; source: string; day: number };
  note?: string;
  items: Item[];
  rounds: Round[];
  templates?: string[];
};

export const DEMO_QUOTES: QuoteSeed[] = [
  {
    styleNo: "12593",
    factory: "DC1",
    moq: 2400,
    strategy: "PS-002",
    target: { usd: 2.82, fx: 6.5, source: "客户采购", day: -18 },
    note: "客户追加到 30000 双，改用大单进取档",
    items: [
      ["YARN", "精梳棉 32S/1", "主纱 · 17.8 g/双", 0.0178, 36],
      ["YARN", "锦纶 70D/24F", "里纱 · 4.6 g/双", 0.0046, 48],
      ["YARN", "氨纶包覆纱 20D", "橡筋 · 2.2 g/双", 0.0022, 78],
      ["YARN", "罗口橡筋线", "1.5 g/双", 0.0015, 50],
      ["LABOR", "织造", "168N 单面", null, null, 2.1],
      ["LABOR", "缝头", "自动缝头", null, null, 0.85],
      ["LABOR", "定型", null, null, null, 0.68],
      ["LABOR", "包装", null, null, null, 0.6],
      ["TRIMS", "卡头", "90×60mm 300g 白卡", 1, 0.18],
      ["TRIMS", "挂钩", "透明 PP", 1, 0.06],
      ["TRIMS", "防滑硅胶", "袜底点胶 18 点", 1, 0.21],
      ["TRIMS", "OPP 袋", "0.04mm", 1, 0.07],
      ["OTHER", "包材", "外箱、内盒分摊", null, null, 1.2],
      ["OTHER", "检测分摊", "色牢度、功能性检测", null, null, 0.85],
      ["OTHER", "物流", "FOB 宁波", null, null, 2.36],
      ["OTHER", "管理费", null, null, null, 5.6],
    ],
    rounds: [
      { kind: "INTERNAL", strategy: "PS-001", quantity: 2400, status: "QUOTED", day: -18, note: "成本核定后内部核价，作为对外报价的底线" },
      { kind: "CUSTOMER", strategy: "PS-001", quantity: 12000, price: 19.31, status: "LAPSED", day: -16, note: "首轮对外报出，按标准档" },
      { kind: "CUSTOMER", strategy: "PS-001", quantity: 12000, price: 19.31, status: "LAPSED", day: -9, note: "客户加量到 12000 双，触发阶梯让利 3%" },
      { kind: "CUSTOMER", strategy: "PS-002", quantity: 30000, price: 18.79, status: "QUOTED", day: -3, note: "客户追加到 30000 双，改用大单进取档" },
    ],
    templates: ["W27 BONDS RFQ 报价单.xlsx", "SS27 报价单（2026-5-9）.xlsx"],
  },
  {
    styleNo: "11506",
    factory: "DC2",
    moq: 15000,
    strategy: "PS-001",
    target: { usd: 1.85, fx: 6.6, source: "客户邮件", day: -130 },
    items: [
      ["YARN", "精梳棉 40S/1", "主纱", 0.019, 50],
      ["LABOR", "织造与缝头", null, null, null, 3.1],
      ["TRIMS", "腰封", null, 1, 0.36],
      ["OTHER", "包材、物流与管理费", null, null, null, 5.5],
    ],
    rounds: [
      { kind: "INTERNAL", strategy: "PS-001", quantity: 15000, status: "QUOTED", day: -125, note: "成本核定后内部核价" },
      { kind: "CUSTOMER", strategy: "PS-001", quantity: 15000, price: 12.8, status: "LAPSED", day: -120, note: "首轮报价" },
      { kind: "CUSTOMER", strategy: "PS-001", quantity: 20000, price: 12.5, status: "ACCEPTED", day: -100, feedbackDay: -95, feedbackNote: "客户邮件确认接受", note: "加量到 20000 双，小幅让价" },
    ],
  },
  {
    styleNo: "11151",
    factory: "NH5",
    moq: 10000,
    strategy: "PS-001",
    target: { usd: 1.48, fx: 6.7, source: "客户系统", day: -70 },
    items: [
      ["YARN", "美丽诺羊毛混纺 2/48Nm", "主纱", 0.015, 100],
      ["LABOR", "织造与缝头", null, null, null, 2.6],
      ["TRIMS", "吊牌", null, 1, 0.3],
      ["OTHER", "包材、物流与管理费", null, null, null, 3],
    ],
    rounds: [
      { kind: "INTERNAL", strategy: "PS-001", quantity: 10000, status: "QUOTED", day: -66 },
      { kind: "CUSTOMER", strategy: "PS-001", quantity: 10000, price: 9.75, status: "ACCEPTED", day: -62, feedbackDay: -60, feedbackNote: "客户系统回传接受" },
    ],
  },
  {
    styleNo: "11152",
    factory: "DC1",
    moq: 8000,
    strategy: "PS-001",
    target: { usd: 1.2, fx: 6.7, source: "客户采购", day: -48 },
    items: [
      ["YARN", "棉氨混纺 32S", "主纱", 0.012, 100],
      ["LABOR", "织造与缝头", null, null, null, 2.2],
      ["TRIMS", "卡头", null, 1, 0.28],
      ["OTHER", "包材、物流与管理费", null, null, null, 2.5],
    ],
    rounds: [
      { kind: "INTERNAL", strategy: "PS-001", quantity: 10000, status: "QUOTED", day: -45 },
      { kind: "CUSTOMER", strategy: "PS-001", quantity: 8000, price: 7.9, status: "ACCEPTED", day: -42, feedbackDay: -40, feedbackNote: "客户接受" },
    ],
  },
  {
    styleNo: "11063",
    factory: "HP3",
    moq: 20000,
    strategy: "PS-002",
    target: { usd: 0.98, fx: 6.72, source: "客户采购", day: -25 },
    items: [
      ["YARN", "精梳棉 32S/1", "主纱", 0.0125, 80],
      ["LABOR", "织造与缝头", null, null, null, 2],
      ["TRIMS", "OPP 袋", null, 1, 0.2],
      ["OTHER", "包材、物流与管理费", null, null, null, 2.4],
    ],
    rounds: [
      { kind: "INTERNAL", strategy: "PS-002", quantity: 20000, status: "QUOTED", day: -22 },
      { kind: "CUSTOMER", strategy: "PS-002", quantity: 20000, price: 7.2, status: "REJECTED", day: -20, feedbackDay: -12, feedbackNote: "客户目标价 $0.98，差距过大" },
    ],
  },
  {
    styleNo: "11720",
    factory: "NH5",
    moq: 12000,
    strategy: "PS-001",
    target: { usd: 1.55, fx: 6.72, source: "客户采购", day: -4 },
    items: [
      ["YARN", "美丽诺混纺石楠色", "主纱", 0.02, 100],
      ["LABOR", "织造与缝头", null, null, null, 2.8],
      ["TRIMS", "吊牌与腰封", null, 1, 0.4],
      ["OTHER", "包材、物流与管理费", null, null, null, 2.7],
    ],
    rounds: [{ kind: "INTERNAL", strategy: "PS-001", quantity: 12000, status: "COST_REVIEW", day: -2, note: "成本审核中" }],
  },
  {
    styleNo: "12750",
    factory: null,
    moq: null,
    strategy: "PS-003",
    items: [
      ["YARN", "涤纶 75D", "主纱", 0.016, 30],
      ["LABOR", "织造", null, null, null, 1.9],
    ],
    rounds: [],
  },
];

function snapshotOf(s: typeof quoteStrategies.$inferSelect): QuoteStrategySnapshot {
  return {
    code: s.code,
    name: s.name,
    method: s.method,
    lossRate: s.lossRate,
    overheadRate: s.overheadRate,
    markupRate: s.markupRate,
    targetMargin: s.targetMargin,
    guardrail: s.guardrail,
    lockedFx: s.lockedFx,
    moq: s.moq,
    smallOrderUplift: s.smallOrderUplift,
    skuTiers: s.skuTiers,
    version: s.version,
  };
}

function amountOf(item: Item): number {
  return item[5] !== undefined ? item[5] : round((item[3] ?? 0) * (item[4] ?? 0), 4);
}

function costOf(items: Item[], s: QuoteStrategySnapshot) {
  const sum = (c: Category) => items.filter((i) => i[0] === c).reduce((acc, i) => acc + amountOf(i), 0);
  const yarnRaw = round(sum("YARN"), 4);
  const laborRaw = round(sum("LABOR"), 4);
  const yarn = round(yarnRaw * (1 + s.lossRate), 2);
  const labor = round(laborRaw * (1 + s.overheadRate), 2);
  const trims = round(sum("TRIMS"), 2);
  const other = round(sum("OTHER"), 2);
  return { costTotal: round(yarn + labor + trims + other, 2), breakdown: { yarn, yarnRaw, yarnLossRate: s.lossRate, labor, laborRaw, overheadRate: s.overheadRate, trims, other } };
}

function suggest(cost: number, s: QuoteStrategySnapshot, quantity: number) {
  const base = s.method === "MARGIN" ? cost / (1 - s.targetMargin) : cost * (1 + s.markupRate);
  const upliftRate = s.moq > 0 && quantity < s.moq ? s.smallOrderUplift : 0;
  const lifted = base * (1 + upliftRate);
  const skuAmount = round(quantity * lifted, 2);
  const tier = [...s.skuTiers].sort((a, b) => b.minAmount - a.minAmount).find((t) => skuAmount >= t.minAmount);
  const discountRate = tier?.discount ?? 0;
  return { basePrice: round(base, 2), upliftRate, skuAmount, discountRate, suggestedPrice: round(lifted * (1 - discountRate), 2) };
}

function aggregate(rounds: Round[]): string {
  const customer = rounds.filter((r) => r.kind === "CUSTOMER");
  const internal = rounds.filter((r) => r.kind === "INTERNAL");
  return (customer[customer.length - 1] ?? internal[internal.length - 1])?.status ?? "DRAFT";
}

export async function seedQuoteDemo(ctx: SeedContext): Promise<void> {
  const strategyRows = await ctx.db.select().from(quoteStrategies);
  const snap = (code: string) => {
    const row = strategyRows.find((s) => s.code === code);
    if (!row) throw new Error(`seed reference missing: strategy ${code}`);
    return { id: row.id, snapshot: snapshotOf(row) };
  };
  for (const q of DEMO_QUOTES) {
    const styleId = ctx.styles[q.styleNo];
    if (!styleId) continue;
    const style = (await ctx.db.select().from(styles).where(eq(styles.id, styleId)))[0]!;
    const header = snap(q.strategy);
    const cost = costOf(q.items, header.snapshot);
    const created = (
      await ctx.db
        .insert(quotes)
        .values({
          styleId,
          factoryId: q.factory ? (ctx.factories[q.factory] ?? null) : null,
          moq: q.moq,
          costTotal: cost.costTotal,
          costBreakdown: cost.breakdown,
          targetPriceUsd: q.target?.usd ?? null,
          targetFx: q.target?.fx ?? null,
          targetSource: q.target?.source ?? null,
          targetDate: q.target ? ctx.day(q.target.day) : null,
          strategyId: header.id,
          status: aggregate(q.rounds),
          note: q.note ?? null,
          ownerId: style.ownerId,
          orgId: style.orgId,
          customerId: style.customerId,
          createdBy: style.ownerId,
          createdAt: ctx.at(q.rounds[0]?.day ?? -1, 8),
        })
        .returning()
    )[0]!;
    await ctx.db.insert(quoteCostItems).values(
      q.items.map((i) => ({ quoteId: created.id, category: i[0], name: i[1], spec: i[2], quantity: i[3], unitPrice: i[4], amount: amountOf(i), createdBy: style.ownerId })),
    );
    let roundNo = 0;
    for (const r of q.rounds) {
      roundNo += 1;
      const s = snap(r.strategy);
      const c = costOf(q.items, s.snapshot);
      const pricing = suggest(c.costTotal, s.snapshot, r.quantity);
      const priceCny = r.kind === "INTERNAL" ? pricing.suggestedPrice : r.price!;
      const priceUsd = round(priceCny / s.snapshot.lockedFx, 2);
      const margin = marginRate(priceCny, c.costTotal);
      await ctx.db.insert(quoteRounds).values({
        quoteId: created.id,
        docNo: quoteNo(q.styleNo, roundNo),
        kind: r.kind,
        roundNo,
        priceCny,
        priceUsd,
        fx: s.snapshot.lockedFx,
        quantity: r.quantity,
        strategyId: s.id,
        margin,
        guardrailPassed: margin >= s.snapshot.guardrail,
        diffToTargetUsd: q.target ? round(priceUsd - q.target.usd, 2) : null,
        status: r.status,
        quotedBy: style.ownerId,
        quotedAt: ctx.at(r.day, 10),
        costTotal: c.costTotal,
        strategySnapshot: s.snapshot,
        pricing,
        feedbackAt: r.feedbackDay !== undefined ? ctx.at(r.feedbackDay, 15) : null,
        feedbackNote: r.feedbackNote ?? null,
        note: r.note ?? null,
        createdBy: style.ownerId,
        createdAt: ctx.at(r.day, 10),
      });
    }
    for (const [i, filename] of (q.templates ?? []).entries()) {
      await ctx.db.insert(files).values({
        storageKey: `demo/quote/${q.styleNo}-${i + 1}.xlsx`,
        filename,
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        size: 18_432 + i * 2048,
        sha256: `demo-quote-${q.styleNo}-${i + 1}`,
        ownerType: "quote",
        ownerId: created.id,
        uploadedBy: style.ownerId,
      });
    }
  }
}
