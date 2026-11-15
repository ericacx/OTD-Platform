import { desc, eq, inArray } from "drizzle-orm";
import { aiConversations, aiMessages, customerOrders, customers, exchangeRates, kbDocuments, roleCustomers } from "../../schema/index.js";
import type { SeedContext } from "./context.js";

const ACTIVE = ["PENDING_CONFIRM", "TO_SCHEDULE", "IN_PRODUCTION", "TO_SHIP"];
const VIDEO_QUESTION = "现在手上有多少张客户订单？按客户分布如何？";

type Answer = { text: string; cards: Record<string, unknown>[]; sources: { module: string; label: string; asOf: string }[]; actions: { label: string; link: string }[] };
type Turn = { question: string; answer: Answer; tool: string; input: Record<string, unknown> };

const round = (n: number, d = 2) => Math.round((n + Number.EPSILON) * 10 ** d) / 10 ** d;
const fmt = (n: number, d = 2) => n.toLocaleString("en-US", { maximumFractionDigits: d });
const addDays = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

async function orderStatsTurn(ctx: SeedContext, scope: { ownerId?: string; customerIds?: string[] }): Promise<Turn> {
  const today = ctx.day(0);
  const asOf = ctx.now.toISOString();
  const rates = await ctx.db.select().from(exchangeRates).orderBy(desc(exchangeRates.effectiveDate));
  const rate = (cur: string) => (rates.find((r) => r.currency === cur && r.effectiveDate <= today) ?? rates.find((r) => r.currency === cur))?.rateToCny;
  const usdRate = rate("USD") ?? 1;
  const toUsd = (amount: number, cur: string) => (cur === "USD" ? amount : ((cur === "CNY" ? (rate("CNY") ?? 1) : rate(cur)) ?? 0) * amount / usdRate);
  const rows = (await ctx.db.select().from(customerOrders).where(inArray(customerOrders.status, ACTIVE))).filter((r) => (!scope.ownerId || r.ownerId === scope.ownerId) && (!scope.customerIds || scope.customerIds.includes(r.customerId)));
  const names = new Map((await ctx.db.select({ id: customers.id, name: customers.name }).from(customers)).map((c) => [c.id, c.name]));
  const total = rows.length;
  const groups = new Map<string, { orders: number; pairs: number }>();
  for (const r of rows) {
    const g = groups.get(r.customerId) ?? { orders: 0, pairs: 0 };
    g.orders += 1;
    g.pairs += r.totalPairs;
    groups.set(r.customerId, g);
  }
  const byCustomer = [...groups.entries()]
    .map(([id, g]) => ({ id, name: names.get(id) ?? "", orders: g.orders, pairs: g.pairs, share: total ? round((g.orders / total) * 100, 1) : 0 }))
    .sort((a, b) => b.orders - a.orders || b.pairs - a.pairs || a.name.localeCompare(b.name));
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const start = addDays(today, i * 7);
    const end = addDays(today, (i + 1) * 7);
    return { label: start.slice(5), due: rows.filter((r) => r.customerDueDate >= start && r.customerDueDate < end).length };
  });
  const average = round(weeks.reduce((s, w) => s + w.due, 0) / 8, 2);
  const count = (s: string) => rows.filter((r) => r.status === s).length;
  const pairs = rows.reduce((s, r) => s + r.totalPairs, 0);
  const valueUsd = round(rows.reduce((s, r) => s + toUsd(r.fobAmount ?? 0, r.currency), 0), 2);
  const pending = count("PENDING_CONFIRM");
  const overdue = rows.filter((r) => r.customerDueDate < today).length;
  const parts = [`在手 ${total} 张客户订单，共 ${fmt(pairs, 0)} 双（${groups.size} 家客户），货值约 $${fmt(valueUsd)}（按当日汇率折美元）。`];
  const [a, b] = byCustomer;
  if (a && b) parts.push(`客户集中度：${a.name}与${b.name}合计占在手订单 ${round(a.share + b.share, 1)}%。`);
  else if (a) parts.push(`全部来自${a.name}。`);
  const peak = weeks.reduce<(typeof weeks)[number] | null>((best, w) => (w.due > (best?.due ?? 0) ? w : best), null);
  if (peak) parts.push(`未来 8 周交期高峰在 ${peak.label} 那一周（${peak.due} 张到期），周均 ${average} 张${peak.due >= 2 && peak.due > average * 1.5 ? "，产能要提前排" : ""}。`);
  if (overdue) parts.push(`另有 ${overdue} 张已过客户交期仍未完成。`);
  if (pending) parts.push(`还有 ${pending} 张卡在待确认，客户不回就没法排产，这是当前最该催的一类。`);
  const cards: Record<string, unknown>[] = [
    {
      type: "kpis",
      title: null,
      items: [
        { label: "订单总数", value: total, unit: "张", format: "int", currency: null, link: "/orders" },
        { label: "双数", value: pairs, unit: "双", format: "int", currency: null, link: null },
        { label: "货值（USD）", value: valueUsd, unit: null, format: "money", currency: "USD", link: null },
        { label: "生产中", value: count("IN_PRODUCTION"), unit: "张", format: "int", currency: null, link: "/orders?status=IN_PRODUCTION" },
      ],
    },
    { type: "highlight", tone: pending > 0 ? "warning" : "success", label: "待确认", value: `${pending} 张`, link: "/orders?status=PENDING_CONFIRM" },
  ];
  if (byCustomer.length) cards.push({ type: "bar", title: "按客户订单分布", unit: "张", items: byCustomer.map((c) => ({ label: c.name, value: c.orders, display: `${c.orders} 张 · ${c.share}%`, link: `/orders?customerId=${c.id}` })) });
  cards.push({ type: "line", title: "未来 8 周交期压力（每周到期订单数）", unit: "张", points: weeks.map((w) => ({ label: w.label, value: w.due })), average });
  return {
    question: VIDEO_QUESTION,
    tool: "order_stats",
    input: {},
    answer: { text: total ? parts.join("") : "你的权限范围内目前没有在手客户订单。", cards, sources: [{ module: "order", label: "订单管理 · 客户订单", asOf }], actions: [{ label: "查看订单列表", link: "/orders" }] },
  };
}

async function kbTurn(ctx: SeedContext, question: string, title: string, term: string): Promise<Turn | null> {
  const doc = (await ctx.db.select().from(kbDocuments).where(eq(kbDocuments.title, title)))[0];
  if (!doc) return null;
  const flat = doc.content.replace(/\s+/g, " ").trim();
  const idx = Math.max(0, flat.toLowerCase().indexOf(term.toLowerCase()));
  const start = Math.max(0, idx - 40);
  const end = Math.min(flat.length, idx + 180);
  const snippet = `${start > 0 ? "…" : ""}${flat.slice(start, end)}${end < flat.length ? "…" : ""}`;
  const link = doc.kind === "MANUAL" ? `/documents/manuals?id=${doc.id}` : `/documents/kb?id=${doc.id}`;
  return {
    question,
    tool: "search_kb",
    input: { query: question },
    answer: {
      text: `根据《${doc.title}》：${snippet}`,
      cards: [{ type: "table", title: "知识库检索结果", columns: [{ key: "doc", label: "文档", align: "left" }, { key: "snippet", label: "相关内容", align: "left" }], rows: [{ cells: { doc: doc.title, snippet }, link, tone: null }] }],
      sources: [{ module: "document", label: "资料管理 · 知识库", asOf: ctx.now.toISOString() }],
      actions: [{ label: "打开知识库", link: "/documents/kb" }],
    },
  };
}

async function insertConversation(ctx: SeedContext, userId: string, at: Date, turns: Turn[]): Promise<void> {
  if (!turns.length) return;
  const conv = (await ctx.db.insert(aiConversations).values({ userId, title: turns[0]!.question.slice(0, 40), messageCount: turns.length * 2, createdAt: at, updatedAt: at }).returning({ id: aiConversations.id }))[0]!;
  let seq = 0;
  for (const turn of turns) {
    await ctx.db.insert(aiMessages).values([
      { conversationId: conv.id, seq: ++seq, role: "user", content: { text: turn.question }, createdAt: at },
      { conversationId: conv.id, seq: ++seq, role: "assistant", content: { answer: turn.answer, toolCalls: [{ tool: turn.tool, input: turn.input }], mode: "offline" }, createdAt: at },
    ]);
  }
}

export async function seedAssistantDemo(ctx: SeedContext): Promise<void> {
  const sales = ctx.user("13800000001");
  const admin = ctx.user("13800000000");
  const salesCustomers = (await ctx.db.select({ id: roleCustomers.customerId }).from(roleCustomers).where(eq(roleCustomers.roleId, ctx.roles.R001!))).map((r) => r.id);
  const todayAt = new Date(Math.min(ctx.now.getTime(), ctx.at(0, 0).getTime() + 53 * 60_000));

  const qrs = await kbTurn(ctx, "什么是 QRS", "开发移交五项齐套操作指南", "QRS");
  if (qrs) await insertConversation(ctx, sales, ctx.at(-1, 9), [qrs]);
  await insertConversation(ctx, sales, todayAt, [await orderStatsTurn(ctx, { ownerId: sales, customerIds: salesCustomers })]);

  const reuse = await kbTurn(ctx, "测试报告能否复用", "常见问题：测试报告能否复用", "复用");
  if (reuse) await insertConversation(ctx, admin, ctx.at(-1, 8), [reuse]);
  await insertConversation(ctx, admin, todayAt, [await orderStatsTurn(ctx, {})]);
}
