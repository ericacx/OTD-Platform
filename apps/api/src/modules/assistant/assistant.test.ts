import { assistantAnswerSchema, assistantMessageSchema, assistantReplySchema, conversationSchema } from "@otd/contracts/assistant";
import { aiMessages, aiUsage, auditLogs, customerOrders, customers, exchangeRates, kbDocuments, patrolHits, patrolRules, rolePermissions, systemParams, todos } from "@otd/db";
import { addDays } from "@otd/shared";
import { and, eq, inArray } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AccessService } from "../../core/access/access.service.js";
import type { AiChatRequest } from "../../core/ai/ai.types.js";
import { type Caller, type TestApp, createTestApp } from "../../testing/test-app.js";
import { extractTerms } from "./assistant.tools.js";
import { parseDate, plan } from "./assistant.offline.js";

const NOW = "2026-10-21T02:00:00Z";
const TODAY = "2026-10-21";
const ACTIVE = ["PENDING_CONFIRM", "TO_SCHEDULE", "IN_PRODUCTION", "TO_SHIP"];
const VIDEO_QUESTION = "现在手上有多少张客户订单？按客户分布如何？";

let t: TestApp;
beforeEach(async () => {
  t = await createTestApp({ now: NOW });
});
afterEach(async () => {
  await t.close();
});

async function ask(caller: Caller, content: string, extra: Record<string, unknown> = {}) {
  const conv = await caller.post("/assistant/conversations", {});
  expect(conv.status).toBe(201);
  const res = await caller.post(`/assistant/conversations/${conv.body.data.id}/messages`, { content, ...extra });
  return { conversationId: conv.body.data.id as string, res, answer: res.body.data?.answer?.answer };
}

async function revoke(permission: string, role = "R001") {
  await t.db.delete(rolePermissions).where(and(eq(rolePermissions.roleId, t.refs.roles[role]!), eq(rolePermissions.permission, permission)));
  t.app.get(AccessService).invalidate();
}

async function expectedStats(filter: (row: typeof customerOrders.$inferSelect) => boolean) {
  const rates = await t.db.select().from(exchangeRates);
  const rate = (cur: string) => rates.find((r) => r.currency === cur)!.rateToCny;
  const rows = (await t.db.select().from(customerOrders).where(inArray(customerOrders.status, ACTIVE))).filter(filter);
  const usd = (amount: number, cur: string) => (cur === "USD" ? amount : (amount * rate(cur)) / rate("USD"));
  const weeks = Array.from({ length: 8 }, (_, i) => rows.filter((r) => r.customerDueDate >= addDays(TODAY, i * 7) && r.customerDueDate < addDays(TODAY, i * 7 + 7)).length);
  return {
    orders: rows.length,
    pairs: rows.reduce((s, r) => s + r.totalPairs, 0),
    valueUsd: Math.round(rows.reduce((s, r) => s + usd(r.fobAmount ?? 0, r.currency), 0) * 100) / 100,
    inProduction: rows.filter((r) => r.status === "IN_PRODUCTION").length,
    pendingConfirm: rows.filter((r) => r.status === "PENDING_CONFIRM").length,
    customers: new Set(rows.map((r) => r.customerId)).size,
    weeks,
  };
}

function kpi(answer: { cards: { type: string; items?: { label: string; value: number }[] }[] }, label: string): number | undefined {
  for (const c of answer.cards) if (c.type === "kpis") for (const i of c.items ?? []) if (i.label === label) return i.value;
  return undefined;
}

describe("assistant · 视频问答与数据范围", () => {
  it("复现视频卡片，数字与订单表一致；王芳与总经理看到的答案不同", async () => {
    const gm = await t.as("gm");
    const sales = await t.as("sales");
    const salesCustomers = ["NSR", "MPT", "BBY", "MRN", "CKD", "APX"].map((c) => t.refs.customers[c]!);

    const g = await ask(gm, VIDEO_QUESTION);
    expect(g.res.status).toBe(201);
    const ga = assistantAnswerSchema.parse(g.answer);
    const ge = await expectedStats(() => true);
    expect(kpi(ga, "订单总数")).toBe(ge.orders);
    expect(kpi(ga, "双数")).toBe(ge.pairs);
    expect(kpi(ga, "货值（USD）")).toBe(ge.valueUsd);
    expect(kpi(ga, "生产中")).toBe(ge.inProduction);
    const highlight = ga.cards.find((c) => c.type === "highlight" && c.label === "待确认");
    expect(highlight && highlight.type === "highlight" && highlight.value).toBe(`${ge.pendingConfirm} 张`);
    const bar = ga.cards.find((c) => c.type === "bar");
    expect(bar && bar.type === "bar" && bar.items.reduce((s, i) => s + i.value, 0)).toBe(ge.orders);
    expect(bar && bar.type === "bar" && bar.items.length).toBe(ge.customers);
    const line = ga.cards.find((c) => c.type === "line");
    expect(line && line.type === "line" && line.points.map((p) => p.value)).toEqual(ge.weeks);
    expect(line && line.type === "line" && line.average).toBe(Math.round((ge.weeks.reduce((s, n) => s + n, 0) / 8) * 100) / 100);
    expect(ga.actions).toContainEqual({ label: "查看订单列表", link: "/orders" });
    expect(ga.sources[0]).toMatchObject({ module: "order", label: "订单管理 · 客户订单", asOf: new Date(NOW).toISOString() });
    expect(ga.text).toContain(`在手 ${ge.orders} 张客户订单`);
    expect(ga.text).toContain("待确认");

    const s = await ask(sales, VIDEO_QUESTION);
    const sa = assistantAnswerSchema.parse(s.answer);
    const se = await expectedStats((r) => r.ownerId === sales.userId && salesCustomers.includes(r.customerId));
    expect(kpi(sa, "订单总数")).toBe(se.orders);
    expect(kpi(sa, "货值（USD）")).toBe(se.valueUsd);
    expect(se.orders).toBeGreaterThan(0);
    expect(se.orders).toBeLessThan(ge.orders);
    const salesBar = sa.cards.find((c) => c.type === "bar");
    expect(salesBar && salesBar.type === "bar" && salesBar.items.map((i) => i.label)).not.toContain("极线");
  });

  it("模型不在 PO 号上越权：别人的 PO 回答查不到，自己的 PO 走主线返回 10 节点", async () => {
    const sales = await t.as("sales");
    const mine = await ask(sales, "PO0010459 到哪一步了");
    const a = assistantAnswerSchema.parse(mine.answer);
    const timeline = a.cards.find((c) => c.type === "timeline");
    expect(timeline && timeline.type === "timeline" && timeline.nodes).toHaveLength(10);
    expect(timeline && timeline.type === "timeline" && timeline.nodes.map((n) => n.code)).toEqual(["N01", "N02", "N03", "N04", "N05", "N06", "N07", "N08", "N09", "N10"]);
    expect(a.text).toContain("PO0010459");
    expect(a.sources[0]).toMatchObject({ module: "order", label: "订单管理 · 订单监控" });
    expect(a.actions.map((x) => x.link)).toContain("/orders/monitor?poNo=PO0010459");

    const other = await t.as("sales2");
    const theirs = await ask(other, "PO0010459 到哪一步了");
    const b = assistantAnswerSchema.parse(theirs.answer);
    expect(b.cards.some((c) => c.type === "timeline")).toBe(false);
    expect(b.text).toContain("没有找到你有权查看的 PO0010459");
    expect(b.text).not.toContain("北岸运动");
  });

  it("页面上下文带 PO 时，问「这单卡在哪」走主线", async () => {
    const sales = await t.as("sales");
    const { answer } = await ask(sales, "这单卡在哪？", { context: { path: "/orders/monitor", docType: "order", docNo: "PO0009631" } });
    const a = assistantAnswerSchema.parse(answer);
    expect(a.cards.some((c) => c.type === "timeline")).toBe(true);
    expect(a.text).toContain("PO0009631");
  });

  it("没有成本权限时工具结果与卡片都不出现成本和毛利", async () => {
    const sales = await t.as("sales");
    const outputs: unknown[] = [];
    t.ai.onChat("assistant.chat", async (req) => {
      const tool = req.tools!.find((x) => x.name === "quote_summary")!;
      const output = await tool.run({ keyword: "12593" });
      outputs.push(output);
      return { text: "报价情况如卡片所示。", toolCalls: [{ name: "quote_summary", input: { keyword: "12593" }, output }] };
    });
    const withCost = await ask(sales, "#12593 报价情况");
    expect(JSON.stringify(outputs[0])).toContain("\"margin\"");
    expect(JSON.stringify(withCost.answer)).toContain("毛利率");

    await revoke("quote.cost.view");
    const without = await ask(sales, "#12593 报价情况");
    const raw = JSON.stringify(outputs[1]);
    expect(raw).toContain("QT-12593");
    expect(raw).not.toContain("\"margin\"");
    expect(raw).not.toContain("costTotal");
    expect(raw).not.toContain("guardrailPassed");
    expect(JSON.stringify(without.answer)).not.toContain("毛利率");
  });

  it("真实模式下 aiAllowed=false 的客户数据不发给模型，并在回答里说明有数据未纳入", async () => {
    const gm = await t.as("gm");
    const nsr = t.refs.customers.NSR!;
    const nsrActive = (await t.db.select().from(customerOrders).where(and(eq(customerOrders.customerId, nsr), inArray(customerOrders.status, ACTIVE)))).length;
    expect(nsrActive).toBeGreaterThan(0);
    await t.db.update(customers).set({ aiAllowed: false }).where(eq(customers.id, nsr));

    const offline = assistantAnswerSchema.parse((await ask(gm, VIDEO_QUESTION)).answer);
    const offlineBar = offline.cards.find((c) => c.type === "bar");
    expect(offlineBar && offlineBar.type === "bar" && offlineBar.items.map((i) => i.label)).toContain("北岸运动");
    expect(offline.text).not.toContain("未纳入");

    const seen: string[] = [];
    let request: AiChatRequest | null = null;
    t.ai.onChat("assistant.chat", async (req) => {
      request = req;
      const output = await req.tools!.find((x) => x.name === "order_stats")!.run({});
      seen.push(JSON.stringify(output));
      return { text: "在手订单主要集中在少数客户。", toolCalls: [{ name: "order_stats", input: {}, output }] };
    });
    const online = assistantAnswerSchema.parse((await ask(gm, VIDEO_QUESTION)).answer);
    expect(seen[0]).not.toContain("北岸运动");
    expect(seen[0]).not.toContain(nsr);
    expect(JSON.parse(seen[0]!).excluded).toBe(nsrActive);
    expect(online.text).toContain("在手订单主要集中在少数客户。");
    expect(online.text).toContain(`有 ${nsrActive} 条数据所属客户设置为不参与 AI 分析，未纳入本次回答`);
    const onlineBar = online.cards.find((c) => c.type === "bar");
    expect(onlineBar && onlineBar.type === "bar" && onlineBar.items.map((i) => i.label)).not.toContain("北岸运动");
    expect(online.cards).toContainEqual(expect.objectContaining({ type: "highlight", label: "有数据未纳入" }));
    const req = request as AiChatRequest | null;
    expect(req?.system).toContain("数字一律照抄工具结果");
    expect(req?.messages[0]?.content).toContain("[上下文] 当前用户：李国华");
    expect(req?.system).not.toContain("李国华");
  });

  it("模拟真实模型的多工具调用序列：服务端按工具结果组装卡片，不信任模型自报的 toolCalls", async () => {
    const sales = await t.as("sales");
    t.ai.onChat("assistant.chat", async (req) => {
      const run = (name: string, input: Record<string, unknown>) => req.tools!.find((x) => x.name === name)!.run(input);
      await Promise.all([run("order_status", { poNo: "PO0009631" }), run("order_stats", {})]);
      return { text: "PO0009631 正在生产，整体在手订单不多。", toolCalls: [{ name: "order_stats", input: {}, output: { totals: { orders: 999 } } }] };
    });
    const { answer } = await ask(sales, "帮我看看 PO0009631 和整体订单");
    const a = assistantAnswerSchema.parse(answer);
    expect(a.cards.map((c) => c.type).slice(0, 2)).toEqual(["kpis", "highlight"]);
    expect(a.cards.some((c) => c.type === "timeline")).toBe(true);
    expect(kpi(a, "订单总数")).not.toBe(999);
    expect(a.sources.map((s) => s.label)).toEqual(["订单管理 · 客户订单", "订单管理 · 订单监控"]);
  });

  it("工具参数无效时以错误结果返回给模型，AI 服务失败映射成模块错误", async () => {
    const sales = await t.as("sales");
    let error = "";
    t.ai.onChat("assistant.chat", async (req) => {
      try {
        await req.tools!.find((x) => x.name === "order_status")!.run({});
      } catch (err) {
        error = err instanceof Error ? err.message : String(err);
      }
      return { text: "请提供 PO 号。", toolCalls: [] };
    });
    const ok = await ask(sales, "订单进度");
    expect(error).toContain("参数无效");
    expect(assistantAnswerSchema.parse(ok.answer).sources[0]!.module).toBe("assistant");

    const { AiProviderError } = await import("../../core/ai/ai.types.js");
    t.ai.onChat("assistant.chat", async () => {
      throw new AiProviderError("超时", "api_error");
    });
    const failed = await ask(sales, "订单进度");
    expect(failed.res.status).toBe(502);
    expect(failed.res.body.errcode).toBe("ASSISTANT_AI_UNAVAILABLE");
  });
});

describe("assistant · 离线规则路由", () => {
  it.each([
    [VIDEO_QUESTION, "order_stats"],
    ["今天有哪些需要我跟进的事", "my_todos"],
    ["PO0010459 到哪一步了", "order_status"],
    ["po0009631 卡在哪", "order_status"],
    ["逾期应收有哪些", "receivables_summary"],
    ["产能哪里紧张", "capacity_summary"],
    ["巡检红灯有哪些", "patrol_hits"],
    ["开发移交怎么做", "search_kb"],
    ["什么是 QRS", "search_kb"],
    ["帮我建个待办：明天跟进 PO0010459 客户确认", "propose_todo"],
    ["给张伟建个待办：周五前提交 PO0009412 船样", "propose_todo"],
    ["帮我记录催收 AR-202610-001：电话联系，客户承诺下周一付款", "propose_collection_log"],
    ["QT-12593-04 报价情况", "quote_summary"],
    ["INSP-2610-020 是什么情况", "search_docs"],
  ])("「%s」→ %s", (question, tool) => {
    expect(plan(question, null, TODAY).calls[0]?.tool).toBe(tool);
  });

  it("识别不了的问题给出示例；解析日期与关键词", () => {
    expect(plan("今天天气怎么样", null, TODAY).fallback).toBe(true);
    expect(parseDate("明天跟进", TODAY)).toBe("2026-10-22");
    expect(parseDate("下周一再说", TODAY)).toBe("2026-10-26");
    expect(parseDate("周五前", TODAY)).toBe("2026-10-23");
    expect(parseDate("11月5日", TODAY)).toBe("2026-11-05");
    expect(parseDate("3天后", TODAY)).toBe("2026-10-24");
    expect(extractTerms("什么是 QRS？")).toEqual(["QRS"]);
    expect(extractTerms("北岸运动的箱唛要求是什么")).toEqual(expect.arrayContaining(["北岸运动", "箱唛"]));
    const todo = plan("帮我建个待办：明天跟进 PO0010459 客户确认", null, TODAY).calls[0]!;
    expect(todo.input).toEqual({ title: "跟进 PO0010459 客户确认", dueDate: "2026-10-22", poNo: "PO0010459" });
    const assign = plan("给张伟建个待办：周五前提交 PO0009412 船样", null, TODAY).calls[0]!;
    expect(assign.input).toMatchObject({ assignee: "张伟", dueDate: "2026-10-23", title: "提交 PO0009412 船样" });
    const log = plan("帮我记录催收 AR-202610-001：电话联系，客户承诺下周一付款", null, TODAY).calls[0]!;
    expect(log.input).toMatchObject({ receivableNo: "AR-202610-001", channel: "PHONE", result: "PROMISED", nextFollowUp: "2026-10-26" });
  });

  it("兜底回答带示例问题和一条来源", async () => {
    const sales = await t.as("sales");
    const a = assistantAnswerSchema.parse((await ask(sales, "今天天气怎么样")).answer);
    expect(a.text).toContain("可以试试这样问我");
    expect(a.text).toContain("产能哪里紧张");
    expect(a.cards).toHaveLength(0);
    expect(a.sources).toEqual([{ module: "assistant", label: "OTD 助手 · 未读取业务数据", asOf: new Date(NOW).toISOString() }]);
  });

  it("知识库检索：抽关键词命中文档并返回片段；客户手册按客户范围过滤", async () => {
    const sales = await t.as("sales");
    const a = assistantAnswerSchema.parse((await ask(sales, "什么是 QRS")).answer);
    expect(a.text).toContain("《开发移交五项齐套操作指南》");
    expect(a.text).toContain("QRS");
    const table = a.cards.find((c) => c.type === "table");
    expect(table && table.type === "table" && table.rows[0]!.cells.doc).toBe("开发移交五项齐套操作指南");
    expect(table && table.type === "table" && table.rows[0]!.link).toMatch(/^\/documents\/kb\?id=/);
    expect(a.sources[0]).toMatchObject({ module: "document", label: "资料管理 · 知识库" });

    const manual = assistantAnswerSchema.parse((await ask(sales, "北岸运动的箱唛要求是什么")).answer);
    expect(manual.text).toContain("北岸运动 包装手册 FA27");

    await t.db.insert(kbDocuments).values({ kind: "MANUAL", title: "海盐家居 验货标准", customerId: t.refs.customers.SSH!, content: "海盐家居要求 AQL 2.5，抽检比例按批次大小确定。", tags: ["验货"] });
    const scoped = assistantAnswerSchema.parse((await ask(sales, "海盐家居的验货标准是什么")).answer);
    expect(scoped.text).not.toContain("AQL 2.5");
    const gm = await t.as("gm");
    expect(assistantAnswerSchema.parse((await ask(gm, "海盐家居的验货标准是什么")).answer).text).toContain("AQL 2.5");

    const quality = await t.as("quality");
    const denied = assistantAnswerSchema.parse((await ask(quality, "晨跑者的测试要求是什么")).answer);
    expect(denied.text).toContain("无权查看知识库");
    expect(denied.text).not.toContain("ISO 105");
  });

  it("待办、应收、产能、巡检意图都返回对应卡片与来源", async () => {
    const sales = await t.as("sales");
    const rule = (await t.db.select().from(patrolRules).limit(1))[0]!;
    const order = (await t.db.select().from(customerOrders).where(eq(customerOrders.poNo, "PO0010459")))[0]!;
    await t.db.insert(patrolHits).values([
      { ruleId: rule.id, lastRunId: rule.id, module: "order", targetType: "order", targetId: order.id, targetNo: "PO0010459", targetName: "北岸运动", light: "RED", severity: "HIGH", message: { zh: "PO 复核超期 3 天", en: "PO review overdue" }, overdueDays: 3, assigneeId: sales.userId, customerId: order.customerId, fingerprint: "t1" },
      { ruleId: rule.id, lastRunId: rule.id, module: "order", targetType: "order", targetId: order.id, targetNo: "PO0009999", targetName: "别人", light: "RED", severity: "HIGH", message: { zh: "别人的命中", en: "x" }, overdueDays: 1, assigneeId: (await t.as("sales2")).userId, customerId: order.customerId, fingerprint: "t2" },
    ]);

    const todosAnswer = assistantAnswerSchema.parse((await ask(sales, "今天有哪些需要我跟进的事")).answer);
    expect(todosAnswer.sources[0]!.module).toBe("todo");
    expect(kpi(todosAnswer, "已逾期")).toBeTypeOf("number");

    const ar = assistantAnswerSchema.parse((await ask(sales, "逾期应收有哪些")).answer);
    expect(ar.sources[0]!.module).toBe("receivable");
    expect(kpi(ar, "逾期笔数")).toBeTypeOf("number");

    const salesCap = assistantAnswerSchema.parse((await ask(sales, "产能哪里紧张")).answer);
    expect(salesCap.text).toContain("无权查看产能台账");
    const manager = await t.as("manager");
    const cap = assistantAnswerSchema.parse((await ask(manager, "产能哪里紧张")).answer);
    expect(cap.sources[0]!.module).toBe("capacity");
    const version = cap.sources[0]!.label.match(/^计划管理 · 产能台账 (V\d+)$/)?.[1];
    expect(version).toBeTruthy();
    expect(cap.text).toContain(`最新产能台账 ${version}`);
    expect(kpi(cap, "紧张针型")).toBeTypeOf("number");

    const patrol = assistantAnswerSchema.parse((await ask(sales, "巡检红灯有哪些")).answer);
    expect(kpi(patrol, "红灯")).toBe(1);
    expect(patrol.text).toContain("PO 复核超期 3 天");
    expect(patrol.text).not.toContain("别人的命中");

    const quality = await t.as("quality");
    const noAr = assistantAnswerSchema.parse((await ask(quality, "逾期应收有哪些")).answer);
    expect(noAr.text).toContain("无权查看应收数据");
    expect(noAr.cards).toContainEqual(expect.objectContaining({ type: "highlight", label: "无权查看" }));
    expect(kpi(noAr, "逾期笔数")).toBeUndefined();
  });
});

describe("assistant · 辅助处理任务需人工确认", () => {
  it("建待办先给 Proposal，确认后才写入；版本冲突、重复确认、他人确认都被拦下并写审计", async () => {
    const sales = await t.as("sales");
    const { conversationId, answer } = await ask(sales, "帮我建个待办：明天跟进 PO0010459 客户确认");
    const a = assistantAnswerSchema.parse(answer);
    expect(a.proposals).toHaveLength(1);
    const p = a.proposals![0]!;
    expect(p).toMatchObject({ kind: "TODO", status: "PENDING", version: 1 });
    expect(p.fields).toContainEqual({ label: "截止日期", value: "2026-10-22" });
    expect(p.targets.map((x) => x.type)).toEqual(["user", "order"]);
    expect((await t.db.select().from(todos).where(eq(todos.fingerprint, `ai:${p.id}`))).length).toBe(0);

    expect((await sales.post(`/assistant/proposals/${p.id}/confirm`, { version: 9 })).status).toBe(409);
    const other = await t.as("sales2");
    expect((await other.post(`/assistant/proposals/${p.id}/confirm`, { version: 1 })).status).toBe(404);

    const ok = await sales.post(`/assistant/proposals/${p.id}/confirm`, { version: 1 });
    expect(ok.status).toBe(200);
    expect(ok.body.data).toMatchObject({ status: "CONFIRMED", version: 2, result: { message: expect.stringContaining("已创建待办"), link: "/todo" } });
    const todo = (await t.db.select().from(todos).where(eq(todos.fingerprint, `ai:${p.id}`)))[0]!;
    expect(todo).toMatchObject({ source: "AI", title: "跟进 PO0010459 客户确认", assigneeId: sales.userId, docNo: "PO0010459", status: "OPEN" });
    expect(todo.dueAt?.toISOString()).toBe("2026-10-22T10:00:00.000Z");
    const board = (await sales.get("/todos/board")).body.data;
    expect([...board.today, ...board.later].map((i: { title: string }) => i.title)).toContain("跟进 PO0010459 客户确认");

    const again = await sales.post(`/assistant/proposals/${p.id}/confirm`, { version: 2 });
    expect(again.status).toBe(409);
    expect(again.body.errcode).toBe("FLOW_ILLEGAL_TRANSITION");
    const audit = await t.db.select().from(auditLogs).where(and(eq(auditLogs.action, "assistant.proposal.confirm"), eq(auditLogs.objectId, p.id)));
    expect(audit).toHaveLength(1);
    expect(audit[0]!.diff).toMatchObject({ source: { to: "AI 助手" }, conversationId: { to: conversationId } });

    const history = (await sales.get(`/assistant/conversations/${conversationId}/messages`)).body.data;
    const reply = assistantMessageSchema.parse(history[1]);
    expect(reply.answer?.proposals?.[0]).toMatchObject({ status: "CONFIRMED", version: 2 });
  });

  it("只能给自己或下属建待办；放弃的草稿不执行", async () => {
    const sales = await t.as("sales");
    const denied = assistantAnswerSchema.parse((await ask(sales, "给李国华建个待办：明天看报表")).answer);
    expect(denied.proposals).toBeUndefined();
    expect(denied.text).toContain("只能给自己或下属建待办");

    const manager = await t.as("manager");
    const assigned = assistantAnswerSchema.parse((await ask(manager, "给王芳建个待办：周五前回复北岸运动船样意见")).answer);
    const p = assigned.proposals![0]!;
    expect(p.fields).toContainEqual({ label: "负责人", value: "王芳" });
    const rejected = await manager.post(`/assistant/proposals/${p.id}/reject`, { version: 1 });
    expect(rejected.status).toBe(200);
    expect(rejected.body.data.status).toBe("REJECTED");
    expect((await manager.post(`/assistant/proposals/${p.id}/confirm`, { version: 2 })).status).toBe(409);
    expect((await t.db.select().from(todos).where(eq(todos.fingerprint, `ai:${p.id}`))).length).toBe(0);
  });

  it("记录催收先给预览，确认后调用应收模块写入催收记录", async () => {
    const sales = await t.as("sales");
    const ar = (await sales.get("/receivables/collection?tab=all&page=1&pageSize=50")).body.data.items[0];
    expect(ar).toBeTruthy();
    const { answer } = await ask(sales, `帮我记录催收 ${ar.docNo}：电话联系，客户承诺下周一付款`);
    const a = assistantAnswerSchema.parse(answer);
    const p = a.proposals![0]!;
    expect(p).toMatchObject({ kind: "COLLECTION_LOG", status: "PENDING" });
    expect(p.fields).toContainEqual({ label: "渠道", value: "电话" });
    const before = (await sales.get(`/receivables/${ar.id}`)).body.data.collections.length;
    const ok = await sales.post(`/assistant/proposals/${p.id}/confirm`, { version: 1 });
    expect(ok.status).toBe(200);
    expect(ok.body.data.status).toBe("CONFIRMED");
    const detail = (await sales.get(`/receivables/${ar.id}`)).body.data;
    expect(detail.collections.length).toBe(before + 1);
    expect(detail.collections[0]).toMatchObject({ channel: "PHONE", result: "PROMISED", nextFollowUp: "2026-10-26" });
  });
});

describe("assistant · 会话、限额与权限", () => {
  it("会话归属：别人的会话 404 且列表看不到；自己可以删除", async () => {
    const sales = await t.as("sales");
    const { conversationId } = await ask(sales, VIDEO_QUESTION);
    const list = (await sales.get("/assistant/conversations")).body.data;
    expect(conversationSchema.parse(list[0])).toMatchObject({ id: conversationId, title: VIDEO_QUESTION.slice(0, 40), messageCount: 2 });
    const msgs = (await sales.get(`/assistant/conversations/${conversationId}/messages`)).body.data;
    expect(msgs.map((m: { role: string }) => m.role)).toEqual(["user", "assistant"]);

    const other = await t.as("sales2");
    expect((await other.get(`/assistant/conversations/${conversationId}/messages`)).status).toBe(404);
    expect((await other.post(`/assistant/conversations/${conversationId}/messages`, { content: "你好" })).status).toBe(404);
    expect((await other.del(`/assistant/conversations/${conversationId}`)).status).toBe(404);
    expect((await other.get("/assistant/conversations")).body.data.map((c: { id: string }) => c.id)).not.toContain(conversationId);

    const second = await sales.post(`/assistant/conversations/${conversationId}/messages`, { content: "今天有哪些需要我跟进的事" });
    expect(second.body.data.conversation.messageCount).toBe(4);
    const ordered = (await sales.get(`/assistant/conversations/${conversationId}/messages`)).body.data;
    expect(ordered.map((m: { text: string }) => m.text)[2]).toBe("今天有哪些需要我跟进的事");

    expect((await sales.del(`/assistant/conversations/${conversationId}`)).status).toBe(200);
    expect((await sales.get(`/assistant/conversations/${conversationId}/messages`)).status).toBe(404);
    expect((await t.db.select().from(aiMessages).where(eq(aiMessages.conversationId, conversationId))).length).toBe(0);
  });

  it("每人每日调用上限读系统参数，超出返回模块错误；每次提问记 ai_usage", async () => {
    await t.db.update(systemParams).set({ value: 2 }).where(eq(systemParams.key, "ai.dailyQuotaPerUser"));
    const sales = await t.as("sales");
    const conv = (await sales.post("/assistant/conversations", {})).body.data;
    expect((await sales.post(`/assistant/conversations/${conv.id}/messages`, { content: "产能哪里紧张" })).status).toBe(201);
    expect((await sales.post(`/assistant/conversations/${conv.id}/messages`, { content: "巡检红灯有哪些" })).status).toBe(201);
    const blocked = await sales.post(`/assistant/conversations/${conv.id}/messages`, { content: "逾期应收有哪些" });
    expect(blocked.status).toBe(429);
    expect(blocked.body.errcode).toBe("ASSISTANT_QUOTA_EXCEEDED");
    expect(blocked.body.errmsg).toContain("2");
    const usage = await t.db.select().from(aiUsage).where(eq(aiUsage.userId, sales.userId));
    expect(usage).toHaveLength(2);
    expect(usage[0]).toMatchObject({ purpose: "assistant.question", model: "offline" });
    const profile = (await sales.get("/assistant/profile")).body.data;
    expect(profile).toMatchObject({ name: { zh: "OTD 助手" }, mode: "offline", quota: { limit: 2, used: 2 } });
    expect(profile.examples).toContain(VIDEO_QUESTION);

    const other = await t.as("sales2");
    expect((await ask(other, "产能哪里紧张")).res.status).toBe(201);
    await t.db.update(aiUsage).set({ createdAt: new Date("2026-10-20T15:00:00Z") }).where(eq(aiUsage.userId, sales.userId));
    expect((await sales.post(`/assistant/conversations/${conv.id}/messages`, { content: "逾期应收有哪些" })).status).toBe(201);
  });

  it("助手名称读系统参数；没有 assistant.chat.use 权限一律 403", async () => {
    await t.db.update(systemParams).set({ value: { zh: "小达", en: "Xiaoda" } }).where(eq(systemParams.key, "assistant.name"));
    const sales = await t.as("sales");
    expect((await sales.get("/assistant/profile")).body.data.name).toEqual({ zh: "小达", en: "Xiaoda" });
    const fallback = assistantAnswerSchema.parse((await ask(sales, "随便聊聊")).answer);
    expect(fallback.sources[0]!.label).toBe("小达 · 未读取业务数据");

    await revoke("assistant.chat.use");
    expect((await sales.get("/assistant/profile")).status).toBe(403);
    expect((await sales.get("/assistant/conversations")).status).toBe(403);
    expect((await sales.post("/assistant/conversations", {})).status).toBe(403);
  });

  it("演示种子：管理员和王芳各有历史会话，视频那条问答与实时回答一致", async () => {
    for (const persona of ["admin", "sales"] as const) {
      const caller = await t.as(persona);
      const list = (await caller.get("/assistant/conversations")).body.data.map((c: unknown) => conversationSchema.parse(c));
      expect(list.length).toBeGreaterThanOrEqual(2);
      expect(list[0]!.title).toBe(VIDEO_QUESTION.slice(0, 40));
      const history = (await caller.get(`/assistant/conversations/${list[0]!.id}/messages`)).body.data.map((m: unknown) => assistantMessageSchema.parse(m));
      expect(history.map((m: { role: string }) => m.role)).toEqual(["user", "assistant"]);
      const seeded = history[1]!.answer!;
      const live = assistantAnswerSchema.parse((await ask(caller, VIDEO_QUESTION)).answer);
      expect(seeded.cards).toEqual(live.cards);
      expect(seeded.text).toBe(live.text);
      for (const c of list.slice(1)) {
        const msgs = (await caller.get(`/assistant/conversations/${c.id}/messages`)).body.data;
        for (const m of msgs) assistantMessageSchema.parse(m);
      }
    }
  });

  it("参数校验：空问题返回 422", async () => {
    const sales = await t.as("sales");
    const conv = (await sales.post("/assistant/conversations", {})).body.data;
    expect((await sales.post(`/assistant/conversations/${conv.id}/messages`, { content: "   " })).status).toBe(422);
  });
});

type SseEvent = { event: string; data: any };

function parseSse(body: string): SseEvent[] {
  return body
    .split("\n\n")
    .map((block) => block.split("\n").filter((line) => line && !line.startsWith(":")))
    .filter((lines) => lines.length)
    .map((lines) => ({
      event: lines.find((l) => l.startsWith("event: "))?.slice(7) ?? "message",
      data: JSON.parse(lines.filter((l) => l.startsWith("data: ")).map((l) => l.slice(6)).join("\n")),
    }));
}

async function stream(caller: Caller, conversationId: string, content: string) {
  const res = await t.app.getHttpAdapter().getInstance().inject({
    method: "POST",
    url: `/api/v1/assistant/conversations/${conversationId}/messages`,
    headers: { authorization: `Bearer ${caller.token}`, accept: "text/event-stream", "x-language": "zh-CN" },
    payload: { content },
  });
  return { status: res.statusCode, contentType: String(res.headers["content-type"] ?? ""), body: res.body, events: res.statusCode === 200 ? parseSse(res.body) : [] };
}

describe("assistant · SSE 流式回答", () => {
  it("Accept: text/event-stream 时先推 delta 再推 done，done 与 JSON 接口同结构并已落库", async () => {
    const sales = await t.as("sales");
    const conv = (await sales.post("/assistant/conversations", {})).body.data;
    const res = await stream(sales, conv.id, VIDEO_QUESTION);
    expect(res.status).toBe(200);
    expect(res.contentType).toContain("text/event-stream");
    expect(res.events.map((e) => e.event)).toEqual(["delta", "done"]);
    const done = assistantReplySchema.parse(res.events[1]!.data);
    expect(res.events[0]!.data.text).toBe(done.answer.text);
    expect(done.answer.answer?.cards.some((c) => c.type === "kpis")).toBe(true);
    expect(done.conversation.messageCount).toBe(2);
    const history = (await sales.get(`/assistant/conversations/${conv.id}/messages`)).body.data;
    expect(history.map((m: { id: string }) => m.id)).toEqual([done.question.id, done.answer.id]);

    const json = await sales.post(`/assistant/conversations/${conv.id}/messages`, { content: "今天有哪些需要我跟进的事" });
    expect(json.status).toBe(201);
    expect(json.body.errcode).toBe(0);
    expect(assistantReplySchema.parse(json.body.data).conversation.messageCount).toBe(4);
  });

  it("真实模型的文字增量逐段推送，结束后 done 里是服务端组装的正式回答", async () => {
    const sales = await t.as("sales");
    t.ai.onChat("assistant.chat", async (req) => {
      await req.tools!.find((x) => x.name === "order_stats")!.run({});
      return { text: "在手订单集中在两家客户。", toolCalls: [] };
    });
    const conv = (await sales.post("/assistant/conversations", {})).body.data;
    const res = await stream(sales, conv.id, VIDEO_QUESTION);
    expect(res.events.filter((e) => e.event === "delta").map((e) => e.data.text).join("")).toBe("在手订单集中在两家客户。");
    const done = assistantReplySchema.parse(res.events.at(-1)!.data);
    expect(done.answer.answer?.sources[0]?.label).toBe("订单管理 · 客户订单");
  });

  it("超出限额、会话不存在、AI 失败都以 error 事件返回模块错误，且不落库", async () => {
    await t.db.update(systemParams).set({ value: 1 }).where(eq(systemParams.key, "ai.dailyQuotaPerUser"));
    const sales = await t.as("sales");
    const conv = (await sales.post("/assistant/conversations", {})).body.data;
    expect((await stream(sales, conv.id, "产能哪里紧张")).events.at(-1)!.event).toBe("done");
    const over = await stream(sales, conv.id, "巡检红灯有哪些");
    expect(over.status).toBe(200);
    expect(over.events).toHaveLength(1);
    expect(over.events[0]).toMatchObject({ event: "error", data: { errcode: "ASSISTANT_QUOTA_EXCEEDED", errParams: { limit: 1 } } });
    expect(over.events[0]!.data.errmsg).toContain("1 次");
    expect((await t.db.select().from(aiMessages).where(eq(aiMessages.conversationId, conv.id))).length).toBe(2);

    const other = await t.as("sales2");
    const missing = await stream(other, conv.id, "你好");
    expect(missing.events).toEqual([{ event: "error", data: expect.objectContaining({ errcode: "COMMON_NOT_FOUND" }) }]);

    const { AiProviderError } = await import("../../core/ai/ai.types.js");
    t.ai.onChat("assistant.chat", async () => {
      throw new AiProviderError("超时", "api_error");
    });
    const otherConv = (await other.post("/assistant/conversations", {})).body.data;
    const failed = await stream(other, otherConv.id, "订单进度");
    expect(failed.events).toEqual([{ event: "error", data: expect.objectContaining({ errcode: "ASSISTANT_AI_UNAVAILABLE" }) }]);
  });

  it("没有 assistant.chat.use 权限时在开流之前返回 403", async () => {
    const sales = await t.as("sales");
    const conv = (await sales.post("/assistant/conversations", {})).body.data;
    await revoke("assistant.chat.use");
    const res = await stream(sales, conv.id, VIDEO_QUESTION);
    expect(res.status).toBe(403);
    expect(res.contentType).toContain("application/json");
    expect(JSON.parse(res.body).errcode).toBe("IAM_FORBIDDEN");
  });
});
