import { eq } from "drizzle-orm";
import { customerOrders, factoryReplies, orderLines, orderStageLogs, poRevisions, productionProgress, styles, todos } from "../../schema/index.js";
import { DEMO_USERS } from "../reference.js";
import type { SeedContext } from "./context.js";

export const DEMO_ORDERS = [
  { poNo: "PO0010459", customer: "NSR", season: "AW26", style: "11506", extraStyles: ["12810"], pairs: 37080, dueOffset: 31, factory: "NH5", status: "PENDING_CONFIRM", currency: "USD", unitPrice: 0.925, transport: "RAIL", destination: "Sète, FR", tradeTerm: "FOB Shanghai · Incoterms 2020", styleType: "老款新色" },
  { poNo: "PO0009631", customer: "MRN", season: "HO26", style: "11151", extraStyles: [], pairs: 12600, dueOffset: 13, factory: "NH5", status: "IN_PRODUCTION", currency: "EUR", unitPrice: 1.86, transport: "OCEAN", destination: "Hamburg, DE", tradeTerm: "FOB Ningbo", styleType: "新款" },
  { poNo: "PO0009412", customer: "BBY", season: "HO26", style: "11152", extraStyles: [], pairs: 8040, dueOffset: 4, factory: "DC1", status: "TO_SHIP", currency: "CNY", unitPrice: 9.8, transport: "EXPRESS", destination: "上海仓", tradeTerm: "DDP", styleType: "老款翻单" },
  { poNo: "PO0009690", customer: "APX", season: "HO26", style: "11063", extraStyles: [], pairs: 9600, dueOffset: 40, factory: "DC2", status: "TO_SCHEDULE", currency: "USD", unitPrice: 1.12, transport: "OCEAN", destination: "Los Angeles, US", tradeTerm: "FOB Shanghai", styleType: "新款" },
  { poNo: "PO0009745", customer: "PLF", season: "HO26", style: "12132", extraStyles: [], pairs: 4200, dueOffset: -20, factory: "HP3", status: "COMPLETED", currency: "JPY", unitPrice: 168, transport: "OCEAN", destination: "Osaka, JP", tradeTerm: "FOB Haiphong", styleType: "新款" },
  { poNo: "PO0009560", customer: "MPT", season: "HO26", style: "11720", extraStyles: [], pairs: 5400, dueOffset: 7, factory: "DC1", status: "IN_PRODUCTION", currency: "USD", unitPrice: 1.45, transport: "OCEAN", destination: "Vancouver, CA", tradeTerm: "FOB Shanghai", styleType: "老款新色" },
  { poNo: "PO0009702", customer: "CKD", season: "HO26", style: "11737", extraStyles: [], pairs: 7200, dueOffset: 25, factory: "DC2", status: "TO_SCHEDULE", currency: "CNY", unitPrice: 6.5, transport: "EXPRESS", destination: "杭州仓", tradeTerm: "DDP", styleType: "新款" },
  { poNo: "PO0010035", customer: "SSH", season: "SP27", style: "12750", extraStyles: [], pairs: 6060, dueOffset: 55, factory: "HP3", status: "PENDING_CONFIRM", currency: "USD", unitPrice: 1.05, transport: "OCEAN", destination: "New York, US", tradeTerm: "FOB Haiphong", styleType: "新款" },
] as const;

const SIZES = ["S", "M", "L"] as const;

export async function seedOrderDemo(ctx: SeedContext): Promise<void> {
  for (const o of DEMO_ORDERS) {
    const styleIds = [o.style, ...o.extraStyles].map((s) => ctx.styles[s]).filter((x): x is string => !!x);
    if (!styleIds.length) continue;
    const mainStyle = (await ctx.db.select().from(styles)).find((s) => s.id === styleIds[0])!;
    const orderDate = ctx.day(Math.min(o.dueOffset - 60, -3));
    const row = (
      await ctx.db
        .insert(customerOrders)
        .values({
          poNo: o.poNo,
          revision: 1,
          channel: "Retail",
          poType: "PDTN-SOCKS",
          productLine: "Performance",
          seasonCode: o.season,
          styleType: o.styleType,
          tradeTerm: o.tradeTerm,
          paymentTerms: "月结 60 天",
          currency: o.currency,
          fobAmount: Math.round(o.pairs * o.unitPrice * 100) / 100,
          buyerEntity: o.customer,
          origin: o.factory === "HP3" ? "Vietnam" : "China",
          orderDate,
          customerDueDate: ctx.day(o.dueOffset),
          factoryReplyDate: o.status === "PENDING_CONFIRM" ? null : ctx.day(o.dueOffset),
          delayDays: o.status === "PENDING_CONFIRM" ? null : 0,
          factoryId: ctx.factories[o.factory] ?? null,
          transportMode: o.transport,
          destination: o.destination,
          totalUnits: Math.round(o.pairs / 6),
          totalPairs: o.pairs,
          merchandiserId: ctx.user("13800000012"),
          status: o.status,
          poTerms: "PO 号须出现在所有发票、出货文件与回执上。",
          confirmedAt: o.status === "PENDING_CONFIRM" ? null : ctx.at(Math.min(o.dueOffset - 55, -2)),
          ownerId: mainStyle.ownerId,
          orgId: mainStyle.orgId,
          customerId: mainStyle.customerId,
          createdBy: mainStyle.ownerId,
        })
        .returning({ id: customerOrders.id })
    )[0]!;
    ctx.orders[o.poNo] = row.id;
    const perStyle = Math.floor(o.pairs / styleIds.length);
    for (const styleId of styleIds) {
      const perSize = Math.floor(perStyle / SIZES.length);
      for (const size of SIZES) {
        await ctx.db.insert(orderLines).values({ orderId: row.id, styleId, color: "Black", size, sku: `${o.customer}-${o.style}-BLK-${size}`, quantity: perSize, unitPrice: o.unitPrice });
      }
    }
    await seedOrderHistory(ctx, o, row.id, mainStyle.ownerId);
  }
  await seedOrderTodos(ctx);
}

type DemoOrder = (typeof DEMO_ORDERS)[number];

const STAGE_RANK: Record<string, number> = { PENDING_CONFIRM: 0, TO_SCHEDULE: 1, IN_PRODUCTION: 2, TO_SHIP: 3, COMPLETED: 4 };
const PROGRESS: Record<string, [number, number][]> = {
  PO0009631: [[-12, 0.05], [-2, 0.12]],
  PO0009560: [[-12, 0.5], [-2, 0.9]],
  PO0009412: [[-15, 0.7], [-6, 1]],
  PO0009745: [[-40, 0.6], [-30, 1]],
};
const REVISED: Record<string, { previousPairs: number; offset: number; note: string }> = {
  PO0009631: { previousPairs: 12000, offset: -32, note: "客户追加 600 双（Rev.2）" },
};

async function seedOrderHistory(ctx: SeedContext, o: DemoOrder, orderId: string, ownerId: string): Promise<void> {
  const rank = STAGE_RANK[o.status] ?? 0;
  const orderOffset = Math.min(o.dueOffset - 60, -3);
  const confirmOffset = Math.min(o.dueOffset - 55, -2);
  const owner = DEMO_USERS.find((u) => ctx.users[u.phone] === ownerId)?.name ?? null;
  const planner = ctx.user("13800000008");
  const merchandiser = ctx.user("13800000012");
  const logs: { status: string; action: string; at: Date; operatorId: string | null; operatorName: string | null; note?: string }[] = [];
  logs.push({ status: "PENDING_CONFIRM", action: "上传客户 PO 并识别字段，进入「待确认」", at: rank === 0 ? ctx.at(Math.max(orderOffset, -4), 9) : ctx.at(orderOffset, 9), operatorId: null, operatorName: "系统识别" });
  if (rank >= 1) {
    logs.push({ status: "PENDING_CONFIRM", action: "登记客户确认 Rev.1（邮件）", at: ctx.at(confirmOffset - 1, 15), operatorId: ownerId, operatorName: owner });
    logs.push({ status: "TO_SCHEDULE", action: "PO 复核规则包全绿，确认订单，进入「待排产」", at: ctx.at(confirmOffset, 10), operatorId: ownerId, operatorName: owner });
  }
  const replies: { versionNo: number; offset: number; replyOffset: number }[] = [];
  if (rank >= 1) {
    if (REVISED[o.poNo]) replies.push({ versionNo: 1, offset: confirmOffset + 1, replyOffset: o.dueOffset + 5 }, { versionNo: 2, offset: confirmOffset + 4, replyOffset: o.dueOffset });
    else replies.push({ versionNo: 1, offset: confirmOffset + 1, replyOffset: o.dueOffset });
  }
  const productionOffset = confirmOffset + 6;
  for (const r of replies) {
    const delay = r.replyOffset - o.dueOffset;
    const at = ctx.at(r.offset, 11);
    await ctx.db.insert(factoryReplies).values({ orderId, versionNo: r.versionNo, replyDate: ctx.day(r.replyOffset), delayDays: delay, note: delay > 0 ? "染色排队，申请延期" : null, createdBy: merchandiser, createdAt: at });
    logs.push({ status: r.offset >= productionOffset && rank >= 2 ? "IN_PRODUCTION" : "TO_SCHEDULE", action: `登记工厂交期回复 V${r.versionNo}：${ctx.day(r.replyOffset)}（${delay === 0 ? "持平" : `延期 ${delay} 天`}）`, at, operatorId: merchandiser, operatorName: "黄磊" });
  }
  if (rank >= 2) logs.push({ status: "IN_PRODUCTION", action: "排产确认，进入「生产中」", at: ctx.at(productionOffset, 9), operatorId: planner, operatorName: "孙悦" });
  if (rank >= 3) logs.push({ status: "TO_SHIP", action: "生产完成并放行，进入「待发货」", at: ctx.at(rank === 3 ? -5 : -28, 16), operatorId: ownerId, operatorName: owner });
  if (rank >= 4) logs.push({ status: "COMPLETED", action: "全部出货签收、回款闭环，订单完成", at: ctx.at(-10, 10), operatorId: ownerId, operatorName: owner });

  const revised = REVISED[o.poNo];
  if (revised) {
    const lines = await ctx.db.select().from(orderLines).where(eq(orderLines.orderId, orderId));
    const ratio = revised.previousPairs / o.pairs;
    await ctx.db.insert(poRevisions).values({
      orderId,
      revision: 1,
      snapshot: { revision: 1, customerDueDate: ctx.day(o.dueOffset), totalPairs: revised.previousPairs, currency: o.currency, tradeTerm: o.tradeTerm, lines: lines.map((l) => ({ styleId: l.styleId, color: l.color, size: l.size, sku: l.sku, quantity: Math.round(l.quantity * ratio), unitPrice: l.unitPrice })) },
      note: revised.note,
      createdBy: ownerId,
      createdAt: ctx.at(revised.offset, 14),
    });
    await ctx.db.update(customerOrders).set({ revision: 2, revisionDate: ctx.day(revised.offset) }).where(eq(customerOrders.id, orderId));
    logs.push({ status: "IN_PRODUCTION", action: `PO 改版 Rev.2：总双数 ${revised.previousPairs.toLocaleString("en-US")} → ${o.pairs.toLocaleString("en-US")}`, at: ctx.at(revised.offset, 14), operatorId: ownerId, operatorName: owner, note: revised.note });
  }
  if (rank >= 1) await ctx.db.update(customerOrders).set({ customerConfirmedAt: ctx.at(confirmOffset - 1, 15), customerConfirmMethod: "EMAIL" }).where(eq(customerOrders.id, orderId));

  logs.sort((a, b) => a.at.getTime() - b.at.getTime());
  for (const l of logs) await ctx.db.insert(orderStageLogs).values({ orderId, status: l.status, action: l.action, note: l.note ?? null, at: l.at, operatorId: l.operatorId, operatorName: l.operatorName });

  for (const [offset, rate] of PROGRESS[o.poNo] ?? []) {
    const at = ctx.at(offset, 17);
    await ctx.db.insert(productionProgress).values({ orderId, factoryId: ctx.factories[o.factory] ?? null, reportDate: ctx.day(offset), knittedPairs: Math.round(o.pairs * rate), packedPairs: Math.round(o.pairs * Math.max(0, rate - 0.2)), completionRate: rate, note: rate >= 1 ? "下机完成" : null, createdBy: merchandiser, createdAt: at, updatedAt: at });
  }
}

async function seedOrderTodos(ctx: SeedContext): Promise<void> {
  const items: { po: string; phone: string; fingerprint?: string; action: string; title: string; description: string; offset: number; hour: number }[] = [
    { po: "PO0010459", phone: "13800000001", fingerprint: "order:review:", action: "order.review", title: "复核客户 PO", description: "北岸运动 · #11506 等 2 款 · 37,080 双 · 规则包待校验", offset: -2, hour: 10 },
    { po: "PO0009631", phone: "13800000001", action: "order.followProduction", title: "跟进生产进度", description: "晨跑者 · #11151 · 完成率 12% · 交期临近，进度落后", offset: 0, hour: 23 },
    { po: "PO0010459", phone: "13800000001", action: "order.customerConfirm", title: "登记客户确认", description: "北岸运动 · PO Rev.1 待客户邮件确认", offset: 2, hour: 10 },
    { po: "PO0009631", phone: "13800000001", action: "order.arrangeInspection", title: "安排尾期验货", description: "晨跑者 · #11151 · 终验须在工厂交期前完成", offset: 5, hour: 10 },
    { po: "PO0009412", phone: "13800000004", action: "order.confirmBooking", title: "确认订舱", description: "蓝湾生活 · #11152 · 8,040 双待发货", offset: -1, hour: 10 },
    { po: "PO0009560", phone: "13800000004", action: "order.followProduction", title: "跟进生产进度", description: "枫林户外 · #11720 · 完成率 90%", offset: 0, hour: 23 },
    { po: "PO0009412", phone: "13800000004", action: "order.prepareDocs", title: "准备出货资料", description: "蓝湾生活 · 装箱单与发票", offset: 3, hour: 10 },
    { po: "PO0010035", phone: "13800000013", fingerprint: "order:review:", action: "order.review", title: "复核客户 PO", description: "海盐家居 · #12750 · 6,060 双", offset: 1, hour: 10 },
    { po: "PO0009702", phone: "13800000013", action: "order.followSchedule", title: "跟进排产确认", description: "云栖童装 · #11737 · 待排产", offset: -3, hour: 10 },
    { po: "PO0009690", phone: "13800000005", action: "order.followSchedule", title: "跟进排产确认", description: "极线 · #11063 · 待排产", offset: 2, hour: 10 },
    { po: "PO0009560", phone: "13800000012", action: "order.recordProduction", title: "登记生产进度", description: "枫林户外 · #11720 · 东城一厂", offset: -1, hour: 10 },
    { po: "PO0009631", phone: "13800000012", action: "order.recordProduction", title: "登记生产进度", description: "晨跑者 · #11151 · 南湖五厂", offset: 0, hour: 23 },
  ];
  for (const it of items) {
    const orderId = ctx.orders[it.po];
    if (!orderId) continue;
    const order = (await ctx.db.select({ customerId: customerOrders.customerId }).from(customerOrders).where(eq(customerOrders.id, orderId)))[0]!;
    await ctx.db.insert(todos).values({
      source: "FLOW",
      action: it.action,
      title: it.title,
      description: it.description,
      docType: "order",
      docId: orderId,
      docNo: it.po,
      link: `/orders/${orderId}`,
      customerId: order.customerId,
      assigneeId: ctx.user(it.phone),
      dueAt: ctx.at(it.offset, it.hour),
      status: "OPEN",
      fingerprint: it.fingerprint ? `${it.fingerprint}${orderId}` : `seed:${it.action}:${orderId}:${it.phone}`,
      createdAt: ctx.at(Math.min(it.offset, 0) - 1, 9),
    });
  }
}
