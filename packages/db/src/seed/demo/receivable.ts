import { and, eq } from "drizzle-orm";
import { collectionLogs, customerOrders, customers, receipts, receivables, shipments } from "../../schema/index.js";
import type { SeedContext } from "./context.js";

const OWNER: Record<string, string> = { NSR: "13800000001", MRN: "13800000001", BBY: "13800000004", MPT: "13800000004", APX: "13800000005", PLF: "13800000005", CKD: "13800000013", SSH: "13800000013" };
const OWNER_ORG: Record<string, string> = { "13800000001": "ORG003", "13800000004": "ORG003", "13800000005": "ORG004", "13800000013": "ORG006" };

type Log = [offset: number, channel: string, result: string, next: number | null, note: string];

type DemoAr = {
  customer: string;
  type: string;
  currency: string;
  amount: number;
  received?: [amount: number, offset: number][];
  due: number;
  source: string;
  disputed?: boolean;
  missingData?: boolean;
  note?: string;
  logs?: Log[];
};

const MANUAL: DemoAr[] = [
  { customer: "MRN", type: "GOODS", currency: "EUR", amount: 66900, due: -42, source: "PO0009428 / SH-2608-009", disputed: true, note: "客户对短装数量有异议", logs: [[-20, "EMAIL", "DISPUTED", 3, "客户称短装 120 双，已请仓库复核签收单"]] },
  { customer: "MRN", type: "GOODS", currency: "EUR", amount: 156300, received: [[155820, -20]], due: -2, source: "PO0009682 / SH-2609-018", note: "尾差 480 待客户补付" },
  { customer: "MRN", type: "GOODS", currency: "EUR", amount: 54000, received: [[54000, -12]], due: -10, source: "PO0009603 / SH-2609-030" },
  { customer: "NSR", type: "GOODS", currency: "USD", amount: 62480, due: 9, source: "PO0009712 / SH-2610-014" },
  { customer: "NSR", type: "SAMPLE", currency: "USD", amount: 2400, due: 60, source: "SMP-2610-022", missingData: true, note: "缺发票号" },
  { customer: "APX", type: "DEDUCTION", currency: "CNY", amount: -8600, due: -33, source: "QCL-2610-006", note: "质量扣款：线头超标返工费" },
  { customer: "APX", type: "FREIGHT", currency: "CNY", amount: 12800, due: 13, source: "FRT-2610-012" },
  { customer: "APX", type: "GOODS", currency: "USD", amount: 77300, received: [[40000, -10]], due: 23, source: "PO0009701 / SH-2609-015" },
  { customer: "APX", type: "GOODS", currency: "CNY", amount: 412800, due: -8, source: "PO0009688 / SH-2609-007", logs: [[-1, "WECHAT", "APPLIED", 0, "客户财务已提交付款申请，今日跟进审批进度"]] },
  { customer: "PLF", type: "GOODS", currency: "JPY", amount: 9860000, due: -2, source: "PO0009709 / SH-2609-011" },
  { customer: "PLF", type: "TESTING", currency: "JPY", amount: 320000, due: -15, source: "TST-2609-025", logs: [[-4, "CUSTOMER_SYSTEM", "APPLIED", 6, "客户系统显示付款申请审批中"]] },
  {
    customer: "CKD",
    type: "GOODS",
    currency: "CNY",
    amount: 42750,
    due: -31,
    source: "PO0009655 / SH-2609-020",
    logs: [
      [-28, "EMAIL", "UNREACHABLE", -21, "邮件未回复"],
      [-21, "PHONE", "UNREACHABLE", -14, "电话无人接听"],
      [-14, "EMAIL", "UNREACHABLE", -7, "再次发送对账单"],
      [-7, "EMAIL", "UNREACHABLE", 1, "抄送客户采购经理"],
    ],
  },
  { customer: "SSH", type: "TESTING", currency: "USD", amount: 1280, due: 13, source: "TST-2610-008", missingData: true, note: "缺开票日" },
  { customer: "SSH", type: "GOODS", currency: "USD", amount: 40200, due: -5, source: "PO0009866 / SH-2609-022", logs: [[-2, "PHONE", "PROMISED", 2, "客户承诺本周五付款"]] },
  { customer: "BBY", type: "TRIMS", currency: "CNY", amount: 46200, due: 20, source: "MTL-2610-033" },
  { customer: "MPT", type: "GOODS", currency: "EUR", amount: 88900, received: [[60000, -6]], due: -2, source: "PO0009533 / SH-2609-002" },
];

const FROM_SHIPMENTS: { po: string; received?: [number, number][] }[] = [{ po: "PO0009412" }, { po: "PO0009745", received: [[300000, -3]] }];

export async function seedReceivableDemo(ctx: SeedContext): Promise<void> {
  const custs = new Map((await ctx.db.select().from(customers)).map((c) => [c.code, c]));
  const today = ctx.day(0);

  async function insert(ar: { customerId: string; ownerId: string; orgId: string; settlementEntity: string | null; sourceType: string; sourceNo: string; orderId?: string | null; shipmentId?: string | null; type: string; currency: string; amount: number; dueDate: string; createdAt: Date; received: [number, number][]; disputed?: boolean; missingData?: boolean; note?: string; logs?: Log[] }) {
    const receivedTotal = ar.received.reduce((s, [a]) => s + a, 0);
    const status = ar.amount < 0 ? "OFFSET_PENDING" : receivedTotal >= ar.amount ? "PAID" : receivedTotal > 0 ? "PARTIAL" : ar.dueDate <= today ? "DUE" : "NOT_DUE";
    const row = (
      await ctx.db
        .insert(receivables)
        .values({
          docNo: await ctx.docNo("receivable", ar.createdAt),
          settlementEntity: ar.settlementEntity,
          sourceType: ar.sourceType,
          sourceNo: ar.sourceNo,
          orderId: ar.orderId ?? null,
          shipmentId: ar.shipmentId ?? null,
          type: ar.type,
          amount: ar.amount,
          currency: ar.currency,
          dueDate: ar.dueDate,
          receivedAmount: receivedTotal,
          status,
          disputed: ar.disputed ?? false,
          missingData: ar.missingData ?? false,
          note: ar.note ?? null,
          ownerId: ar.ownerId,
          orgId: ar.orgId,
          customerId: ar.customerId,
          createdBy: ar.ownerId,
          createdAt: ar.createdAt,
        })
        .returning({ id: receivables.id })
    )[0]!;
    for (const [amount, offset] of ar.received) {
      await ctx.db.insert(receipts).values({ receivableId: row.id, amount, currency: ar.currency, receivedAt: ctx.day(offset), method: "TT", bankRef: `TT${ctx.day(offset).replaceAll("-", "")}${String(Math.round(amount)).slice(-4)}`, createdBy: ctx.user("13800000011"), createdAt: ctx.at(offset, 11) });
    }
    for (const [offset, channel, result, next, note] of ar.logs ?? []) {
      await ctx.db.insert(collectionLogs).values({ receivableId: row.id, channel, result, note, nextFollowUp: next === null ? null : ctx.day(next), createdBy: ar.ownerId, createdAt: ctx.at(offset, 16) });
    }
  }

  for (const s of FROM_SHIPMENTS) {
    const orderId = ctx.orders[s.po];
    if (!orderId) continue;
    const order = (await ctx.db.select().from(customerOrders).where(eq(customerOrders.id, orderId)))[0];
    const customer = order ? [...custs.values()].find((c) => c.id === order.customerId) : undefined;
    if (!order || !customer) continue;
    const signed = await ctx.db.select().from(shipments).where(and(eq(shipments.orderId, orderId), eq(shipments.status, "SIGNED")));
    for (const sh of signed) {
      if (!sh.signedAt) continue;
      const signedDay = sh.signedAt.toISOString().slice(0, 10);
      const due = new Date(`${signedDay}T00:00:00.000Z`);
      due.setUTCDate(due.getUTCDate() + customer.paymentTermsDays);
      const unitPrice = order.fobAmount && order.totalPairs ? order.fobAmount / order.totalPairs : 0;
      await insert({
        customerId: order.customerId,
        ownerId: order.ownerId,
        orgId: order.orgId,
        settlementEntity: customer.settlementEntity,
        sourceType: "SHIPMENT",
        sourceNo: sh.docNo,
        orderId,
        shipmentId: sh.id,
        type: "GOODS",
        currency: order.currency,
        amount: Math.round((sh.pairs ?? 0) * unitPrice * 100) / 100,
        dueDate: due.toISOString().slice(0, 10),
        createdAt: sh.signedAt,
        received: s.received ?? [],
      });
    }
  }

  for (const m of MANUAL) {
    const customer = custs.get(m.customer);
    const phone = OWNER[m.customer];
    if (!customer || !phone) continue;
    const terms = customer.paymentTermsDays;
    await insert({
      customerId: customer.id,
      ownerId: ctx.user(phone),
      orgId: ctx.org(OWNER_ORG[phone]!),
      settlementEntity: customer.settlementEntity,
      sourceType: m.source.includes("SH-") ? "SHIPMENT" : "MANUAL",
      sourceNo: m.source,
      type: m.type,
      currency: m.currency,
      amount: m.amount,
      dueDate: ctx.day(m.due),
      createdAt: ctx.at(Math.min(m.due - terms, -1), 10),
      received: m.received ?? [],
      ...(m.disputed ? { disputed: true } : {}),
      ...(m.missingData ? { missingData: true } : {}),
      ...(m.note ? { note: m.note } : {}),
      ...(m.logs ? { logs: m.logs } : {}),
    });
  }
}
