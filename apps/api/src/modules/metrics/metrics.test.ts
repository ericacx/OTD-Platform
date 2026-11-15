import { customerOrders, diagnoses, metricSnapshots, nodeStateSnapshots, orgs, patrolHits, todos } from "@otd/db";
import { and, eq, inArray, ne } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AiProvider } from "../../core/ai/ai.types.js";
import { FakeAiProvider } from "../../core/ai/fake.provider.js";
import { Scheduler } from "../../core/scheduler.js";
import { type TestApp, createTestApp } from "../../testing/test-app.js";
import { type RenderedItem, type Signal, keepsFacts, numericTokens, polishItems, renderSignal, sameNumbers, selectSignals } from "./diagnosis.js";
import { MetricsService } from "./metrics.service.js";

const NOW = "2026-10-21T01:00:00Z";
const USD = 7.1;
const EUR = 7.75;
const JPY = 0.048;
const round1 = (n: number) => Math.round(n * 10) / 10;
const wan = (cny: number) => round1(cny / 10_000);

let t: TestApp;
beforeEach(async () => {
  t = await createTestApp({ now: NOW });
});
afterEach(async () => {
  await t.close();
});

type Kpi = { key: string; value: number | null; display: string; sub: { zh: string }; numerator: number | null; denominator: number | null };
const kpiOf = (board: { kpis: Kpi[] }, key: string) => board.kpis.find((k) => k.key === key)!;

describe("metrics · GM board", () => {
  it("matches hand-computed KPIs on the demo data", async () => {
    const gm = await t.as("gm");
    await gm.post("/patrol/run");
    const month = (await gm.get("/metrics/boards/gm?period=month")).body.data;
    expect(month).toMatchObject({ board: "gm", tab: "overview", asOf: "2026-10-21", period: { code: "2026-10", start: "2026-10-01", end: "2026-10-31" }, scope: { key: "ALL", dataScope: "ALL" } });
    expect(month.kpis.map((k: Kpi) => k.key)).toEqual(["confirmedAmountWan", "deliveredAmountWan", "receivedAmountWan", "onTimeDeliveryRate", "riskAmountWan", "fulfillmentIndex"]);

    const confirmedOct = wan(9600 * 1.12 * USD);
    expect(kpiOf(month, "confirmedAmountWan")).toMatchObject({ value: confirmedOct, display: "7.6", numerator: 7.6, denominator: 12, sub: { zh: `目标达成 ${round1((confirmedOct / 12) * 100).toFixed(1)}%` } });
    expect(kpiOf(month, "deliveredAmountWan").value).toBe(wan((3000 + 2500 + 2540) * 9.8));
    const receivedOct = wan(155_820 * EUR + 54_000 * EUR + 40_000 * USD + 60_000 * EUR + 300_000 * JPY);
    expect(kpiOf(month, "receivedAmountWan").value).toBe(receivedOct);
    expect(receivedOct).toBe(239);
    const overdueAll = wan(66_900 * EUR + 480 * EUR + 412_800 + 9_860_000 * JPY + 320_000 * JPY + 28_900 * EUR + 42_750 + 40_200 * USD);
    expect(kpiOf(month, "receivedAmountWan").sub.zh).toContain(`逾期应收 ${overdueAll.toFixed(1)}`);
    expect(overdueAll).toBe(197.6);

    const year = (await gm.get("/metrics/boards/gm?period=year")).body.data;
    const confirmedYear = wan(12_600 * 1.86 * EUR + 8040 * 9.8 + 9600 * 1.12 * USD + 4200 * 168 * JPY + 5400 * 1.45 * USD + 7200 * 6.5);
    expect(kpiOf(year, "confirmedAmountWan").value).toBe(confirmedYear);
    expect(confirmedYear).toBe(47.3);
    expect(kpiOf(year, "confirmedAmountWan").denominator).toBe(144);

    const active = await t.db.select().from(customerOrders).where(inArray(customerOrders.status, ["PENDING_CONFIRM", "TO_SCHEDULE", "IN_PRODUCTION", "TO_SHIP"]));
    const blocked = new Set((await t.db.select({ id: nodeStateSnapshots.orderId }).from(nodeStateSnapshots).where(eq(nodeStateSnapshots.state, "BLOCKED"))).map((r) => r.id));
    const red = await t.db.select().from(patrolHits).where(and(eq(patrolHits.light, "RED"), ne(patrolHits.status, "CLOSED")));
    const redOrders = new Set(red.flatMap((h) => [h.orderId, h.targetType === "order" ? h.targetId : null]).filter((x): x is string => !!x));
    const rate = (cur: string) => (cur === "USD" ? USD : cur === "EUR" ? EUR : cur === "JPY" ? JPY : 1);
    const risky = active.filter((o) => blocked.has(o.id) || redOrders.has(o.id));
    expect(risky.length).toBeGreaterThan(0);
    expect(kpiOf(month, "riskAmountWan")).toMatchObject({ value: wan(risky.reduce((s, o) => s + (o.fobAmount ?? 0) * rate(o.currency), 0)), numerator: risky.length });

    const fulfillment = kpiOf(month, "fulfillmentIndex");
    const parts = [...fulfillment.sub.zh.matchAll(/(\d+\.\d)/g)].map((m) => Number(m[1]));
    expect(fulfillment.value).toBe(round1(parts.reduce((s, x) => s + x, 0) / parts.length));

    const trend = month.charts.find((c: { key: string }) => c.key === "confirmTrend");
    expect(trend.data).toHaveLength(8);
    expect(trend.data.slice(0, 7).map((d: { confirmedWan: number }) => d.confirmedWan)).toEqual([18.4, 9.8, 24.1, 15.3, 21.7, 11.2, 19.5]);
    expect(trend.data.map((d: { source: string }) => d.source)).toEqual([...Array(7).fill("SNAPSHOT"), "LIVE"]);
    expect(trend.data[7]).toMatchObject({ key: "2026-10-19", label: "10-19" });
    expect(month.charts.find((c: { key: string }) => c.key === "confirmedByCustomer").data).toEqual([expect.objectContaining({ label: "极线", value: confirmedOct })]);
    expect(month.table.key).toBe("overview");

    for (const tab of ["dept", "customer", "employee"]) {
      const res = (await gm.get(`/metrics/boards/gm?tab=${tab}&period=year`)).body.data;
      expect(res.charts).toEqual([]);
      expect(res.table.key).toBe(tab);
      expect(res.table.rows.length).toBeGreaterThan(0);
    }
    const dept = (await gm.get("/metrics/boards/gm?tab=dept&period=year")).body.data.table.rows;
    expect(dept.map((r: { dept: string }) => r.dept).sort()).toEqual(["业务一部", "业务三部", "业务二部"].sort());
    expect(round1(dept.reduce((s: number, r: { overdueArWan: number }) => s + r.overdueArWan, 0))).toBeCloseTo(overdueAll, 0);
  });
});

describe("metrics · manager board", () => {
  it("matches hand-computed KPIs and narrows with org and customer filters", async () => {
    const manager = await t.as("manager");
    const month = (await manager.get("/metrics/boards/manager")).body.data;
    expect(month.scope.dataScope).toBe("ORG_AND_CHILDREN");
    expect(kpiOf(month, "deptCustomers").value).toBe(6);
    const overdue = wan(66_900 * EUR + 480 * EUR + 412_800 + 9_860_000 * JPY + 320_000 * JPY + 28_900 * EUR);
    expect(overdue).toBe(164.8);
    expect(kpiOf(month, "overdueArWan")).toMatchObject({ value: overdue, numerator: 6 });
    expect(kpiOf(month, "aged30ArWan")).toMatchObject({ value: wan(66_900 * EUR), numerator: 1 });
    expect(kpiOf(month, "dueDateChangeRate")).toMatchObject({ value: 0, numerator: 0, denominator: 1 });
    const health = month.table;
    expect(health.key).toBe("health");
    expect(health.rows).toHaveLength(6);
    expect(health.rows.filter((r: { levelCode: string }) => r.levelCode === "HIGH_RISK").length).toBe(kpiOf(month, "highRiskCustomers").value);
    expect(health.rows.filter((r: { levelCode: string }) => r.levelCode === "WATCH").length).toBe(kpiOf(month, "watchCustomers").value);
    const mrn = health.rows.find((r: { customer: string }) => r.customer === "晨跑者");
    expect(mrn).toMatchObject({ levelCode: "HIGH_RISK", overdueArWan: wan(67_380 * EUR) });

    const year = (await manager.get("/metrics/boards/manager?period=year")).body.data;
    expect(kpiOf(year, "dueDateChangeRate")).toMatchObject({ value: 20, numerator: 1, denominator: 5 });

    const byCustomer = (await manager.get(`/metrics/boards/manager?customerId=${t.refs.customers.MRN}`)).body.data;
    expect(kpiOf(byCustomer, "overdueArWan").value).toBe(wan((66_900 + 480) * EUR));
    expect(kpiOf(byCustomer, "deptCustomers").value).toBe(1);
    const dept2 = (await t.db.select().from(orgs).where(eq(orgs.code, "ORG004")))[0]!;
    const byOrg = (await manager.get(`/metrics/boards/manager?orgId=${dept2.id}`)).body.data;
    expect(kpiOf(byOrg, "overdueArWan").value).toBe(wan(412_800 + 9_860_000 * JPY + 320_000 * JPY));
    expect(byOrg.scope.label.zh).toContain("业务二部");
    const dept3 = (await t.db.select().from(orgs).where(eq(orgs.code, "ORG006")))[0]!;
    const outside = (await manager.get(`/metrics/boards/manager?orgId=${dept3.id}`)).body.data;
    expect(kpiOf(outside, "overdueArWan").value).toBe(0);

    for (const tab of ["team", "contribution", "bottleneck"]) {
      const res = (await manager.get(`/metrics/boards/manager?tab=${tab}`)).body.data;
      expect(res.table.key).toBe(tab);
      expect(res.charts).toEqual([]);
    }
    const team = (await manager.get("/metrics/boards/manager?tab=team")).body.data.table.rows.map((r: { user: string }) => r.user);
    expect(team).toEqual(expect.arrayContaining(["王芳", "张伟", "刘洋"]));
    expect(team).not.toContain("林悦");
  });
});

describe("metrics · sales board", () => {
  it("computes task KPIs from the assignee's to-dos only", async () => {
    const sales = await t.as("sales");
    const before = (await sales.get("/metrics/boards/sales")).body.data;
    expect(before.scope.dataScope).toBe("SELF");
    const base = (key: string) => kpiOf(before, key);
    expect(base("avgCycleDays").value).toBeNull();
    const at = (iso: string) => new Date(iso);
    const common = { source: "FLOW", title: "fixture", assigneeId: sales.userId, customerId: t.refs.customers.NSR };
    await t.db.insert(todos).values([
      { ...common, action: "sample.round.approve", docType: "sample", docId: "fixture-sample", fingerprint: "fx:a", status: "DONE", createdAt: at("2026-10-05T10:00:00Z"), dueAt: at("2026-10-10T12:00:00Z"), doneAt: at("2026-10-09T10:00:00Z") },
      { ...common, action: "sample.round.approve", docType: "sample", docId: "fixture-sample", fingerprint: "fx:b", status: "DONE", createdAt: at("2026-10-11T10:00:00Z"), dueAt: at("2026-10-12T12:00:00Z"), doneAt: at("2026-10-14T10:00:00Z") },
      { ...common, action: "quote.feedback", docType: "quote", docId: "fixture-quote", fingerprint: "fx:c", status: "OPEN", createdAt: at("2026-10-14T10:00:00Z"), dueAt: at("2026-10-15T10:00:00Z") },
      { ...common, action: "quote.feedback", docType: "quote", docId: "fixture-quote-2", fingerprint: "fx:d", status: "CANCELLED", createdAt: at("2026-10-14T10:00:00Z"), dueAt: at("2026-10-16T10:00:00Z") },
      { ...common, action: "order.review", docType: "order", docId: "fixture-order", fingerprint: "fx:e", status: "DONE", createdAt: at("2026-10-16T10:00:00Z"), dueAt: at("2026-11-05T10:00:00Z"), doneAt: at("2026-10-18T10:00:00Z") },
    ]);
    const after = (await sales.get("/metrics/boards/sales")).body.data;
    const due = base("dueTasks").value! + 3;
    const done = base("completionRate").numerator! + 2;
    const onTime = base("onTimeRate").numerator! + 1;
    expect(kpiOf(after, "dueTasks").value).toBe(due);
    expect(kpiOf(after, "completionRate")).toMatchObject({ value: round1((done / due) * 100), numerator: done, denominator: due });
    expect(kpiOf(after, "onTimeRate")).toMatchObject({ value: round1((onTime / due) * 100), numerator: onTime });
    expect(kpiOf(after, "overdueOpen").value).toBe(base("overdueOpen").value! + 1);
    expect(kpiOf(after, "avgCycleDays")).toMatchObject({ value: round1((4 + 3 + 2) / 3), numerator: 3 });
    expect(kpiOf(after, "reworkRate")).toMatchObject({ value: round1((1 / 3) * 100), numerator: 1, denominator: 3 });
    const overdueChart = after.charts.find((c: { key: string }) => c.key === "overdueByCategory");
    expect(overdueChart.data.find((d: { key: string }) => d.key === "QUOTE").value).toBe(1);
    expect(after.table.key).toBe("work");

    const other = (await (await t.as("sales2")).get("/metrics/boards/sales")).body.data;
    const otherBefore = other.kpis.find((k: Kpi) => k.key === "dueTasks").value;
    expect(kpiOf(other, "reworkRate").denominator).toBe(0);
    expect(otherBefore).not.toBe(due);

    const progress = (await sales.get("/metrics/boards/sales?tab=progress")).body.data.table;
    expect(progress.rows.find((r: { key: string }) => r.key === "order.pending").count).toBe(1);
    const contribution = (await sales.get("/metrics/boards/sales?tab=contribution")).body.data.table;
    expect(contribution.columns.map((c: { key: string }) => c.key)).not.toContain("confirmedWan");
  });
});

describe("metrics · diagnosis", () => {
  it("derives every number from signals, caches per scope and day, and refreshes on demand", async () => {
    const gm = await t.as("gm");
    await gm.post("/patrol/run");
    const board = (await gm.get("/metrics/boards/gm")).body.data;
    const first = await gm.get("/metrics/boards/gm/diagnosis");
    expect(first.status).toBe(200);
    const d = first.body.data;
    expect(d).toMatchObject({ board: "gm", scopeKey: "ALL", period: "2026-10", title: "本期经营分析", asOf: "2026-10-21", cached: false, model: null });
    expect(d.items.length).toBeGreaterThanOrEqual(3);
    expect(d.items.length).toBeLessThanOrEqual(6);
    expect(d.items.map((i: { no: number }) => i.no)).toEqual(d.items.map((_: unknown, idx: number) => idx + 1));
    const levels = d.items.map((i: { level: string }) => i.level);
    expect(levels.indexOf("WATCH") === -1 || levels.lastIndexOf("PRIORITY") < levels.indexOf("WATCH")).toBe(true);
    for (const item of d.items) {
      const signal = d.signals.find((s: { key: string }) => s.key === item.signalKey);
      expect(signal, item.signalKey).toBeDefined();
      expect(item.numbers).toEqual(signal.numbers);
      const allowed = new Set(Object.values(item.numbers as Record<string, string | number>).flatMap((v) => [...numericTokens(String(v))]));
      for (const token of numericTokens(`${item.title}${item.basis}${item.suggestion}`)) expect(allowed.has(token), `${item.signalKey}: ${token}`).toBe(true);
    }
    const ar = d.items.find((i: { signalKey: string }) => i.signalKey === "gm.overdueAr");
    expect(ar.numbers.overdueWan).toBe("197.6");
    expect(kpiOf(board, "receivedAmountWan").sub.zh).toContain(`逾期应收 ${ar.numbers.overdueWan}`);
    expect(ar.title).toBe(`逾期应收 197.6 万元，其中账龄超 30 天 ${ar.numbers.aged30Wan} 万元`);
    const risk = d.items.find((i: { signalKey: string }) => i.signalKey === "gm.risk");
    expect(risk.numbers.wan).toBe(kpiOf(board, "riskAmountWan").display);

    const again = (await gm.get("/metrics/boards/gm/diagnosis")).body.data;
    expect(again).toMatchObject({ cached: true, generatedAt: d.generatedAt });
    const refreshed = await gm.post("/metrics/boards/gm/diagnosis/refresh");
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.data.cached).toBe(false);
    expect((await t.db.select().from(diagnoses).where(eq(diagnoses.board, "gm"))).length).toBe(2);
    t.clock.advanceDays(1);
    const admin = await t.as("admin");
    expect((await admin.get("/metrics/boards/gm/diagnosis")).body.data.cached).toBe(false);
  });

  it("keeps diagnoses apart for different people", async () => {
    const a = (await (await t.as("sales")).get("/metrics/boards/sales/diagnosis")).body.data;
    const b = (await (await t.as("sales2")).get("/metrics/boards/sales/diagnosis")).body.data;
    expect(a.scopeKey).not.toBe(b.scopeKey);
    expect(a.scopeKey).toMatch(/^SELF:/);
    const cachedB = (await (await t.as("sales2")).get("/metrics/boards/sales/diagnosis")).body.data;
    expect(cachedB).toMatchObject({ cached: true, scopeKey: b.scopeKey, generatedAt: b.generatedAt });
    expect(a.scopeLabel).toContain("个人范围");
    const rows = await t.db.select().from(diagnoses).where(eq(diagnoses.board, "sales"));
    expect(rows.map((r) => r.scopeKey).sort()).toEqual([a.scopeKey, b.scopeKey].sort());
  });

  it("only accepts AI wording when it keeps the numbers", async () => {
    const signals: Signal[] = [
      { key: "gm.overdueAr", level: "PRIORITY", impact: 10, numbers: { overdueWan: "197.6", agedDays: 30, aged30Wan: "56.1" } },
      { key: "gm.risk", level: "PRIORITY", impact: 5, numbers: { count: 7, wan: "72.8", red: 5, blocked: 7 } },
    ];
    const items: RenderedItem[] = signals.map(renderSignal);
    const stub: AiProvider = {
      name: "claude",
      available: true,
      extract: async () => {
        throw new Error("unused");
      },
      chat: async () => ({
        text: JSON.stringify([
          { title: "逾期应收达 197.6 万元，账龄超 30 天的有 56.1 万元", basis: "按月度汇率折人民币，截至数据截点", suggestion: "建议按账龄由长到短清收" },
          { title: "在手风险订单 8 张、72.8 万元", basis: items[1]!.basis, suggestion: items[1]!.suggestion },
        ]),
        toolCalls: [],
      }),
    };
    const out = await polishItems(stub, items);
    expect(out.model).toBe("claude");
    expect(out.items[0]!.title).toBe("逾期应收达 197.6 万元，账龄超 30 天的有 56.1 万元");
    expect(out.items[1]).toEqual(items[1]);
    expect(await polishItems(new FakeAiProvider(), items)).toEqual({ items, model: null });
    expect(sameNumbers("逾期 197.6 万元", "逾期应收 197.60 万元")).toBe(true);
    expect(sameNumbers("在手 7 张", "在手 8 张")).toBe(false);
    expect(sameNumbers("红灯 5 张、受阻 7 张", "受阻 7 张、红灯 5 张")).toBe(false);
  });

  it("rejects AI wording that swaps numbers, moves them between fields or drops names", () => {
    const item = renderSignal({ key: "gm.risk", level: "PRIORITY", impact: 1, numbers: { count: 7, wan: "72.8", red: 5, blocked: 7 } });
    expect(keepsFacts(item, { title: "在手风险订单 7 张，共 72.8 万元", basis: item.basis, suggestion: item.suggestion })).toBe(true);
    expect(keepsFacts(item, { title: item.title, basis: "其中节点受阻 7 张、有红灯巡检 5 张", suggestion: item.suggestion })).toBe(false);
    expect(keepsFacts(item, { title: "在手风险 7 张", basis: `72.8 万元，${item.basis}`, suggestion: item.suggestion })).toBe(false);
    const named = renderSignal({ key: "gm.arConcentration", level: "PRIORITY", impact: 1, numbers: { customer: "晨跑者", wan: "52.2", share: "31.7", threshold: 30 } });
    expect(keepsFacts(named, { title: "逾期应收集中在某客户：52.2 万元，占 31.7%", basis: named.basis, suggestion: named.suggestion })).toBe(false);
    expect(keepsFacts(named, { title: "晨跑者的逾期应收有 52.2 万元，占 31.7%", basis: named.basis, suggestion: named.suggestion })).toBe(true);
  });

  it("selects priority signals first, caps at six and pads to three", () => {
    const mk = (key: string, level: "PRIORITY" | "WATCH", impact: number, filler = false): Signal => ({ key, level, impact, numbers: {}, ...(filler ? { filler } : {}) });
    const many = [mk("w1", "WATCH", 900), mk("p1", "PRIORITY", 1), mk("p2", "PRIORITY", 50), mk("w2", "WATCH", 10), mk("w3", "WATCH", 5), mk("w4", "WATCH", 4), mk("w5", "WATCH", 3), mk("f", "WATCH", 0, true)];
    expect(selectSignals(many).map((s) => s.key)).toEqual(["p2", "p1", "w1", "w2", "w3", "w4"]);
    expect(selectSignals([mk("p1", "PRIORITY", 1), mk("f1", "WATCH", 0, true), mk("f2", "WATCH", 0, true), mk("f3", "WATCH", 0, true)]).map((s) => s.key)).toEqual(["p1", "f1", "f2"]);
  });
});

describe("metrics · definitions, permissions and snapshots", () => {
  it("serves metric definitions and enforces board permissions", async () => {
    const sales = await t.as("sales");
    const defs = (await sales.get("/metrics/definitions")).body.data;
    for (const key of ["dueTasks", "completionRate", "onTimeRate", "overdueOpen", "avgCycleDays", "reworkRate", "deptCustomers", "highRiskCustomers", "watchCustomers", "overdueArWan", "aged30ArWan", "dueDateChangeRate", "confirmedAmountWan", "deliveredAmountWan", "receivedAmountWan", "onTimeDeliveryRate", "riskAmountWan", "fulfillmentIndex"]) {
      const def = defs.find((d: { key: string }) => d.key === key);
      expect(def, key).toBeDefined();
      expect(def.formula.zh.length).toBeGreaterThan(0);
      expect(def.source.zh.length).toBeGreaterThan(0);
    }
    expect((await sales.get("/metrics/boards/sales")).status).toBe(200);
    expect((await sales.get("/metrics/boards/manager")).status).toBe(403);
    expect((await sales.get("/metrics/boards/gm")).status).toBe(403);
    expect((await sales.get("/metrics/boards/gm/diagnosis")).status).toBe(403);
    expect((await sales.post("/metrics/boards/manager/diagnosis/refresh")).status).toBe(403);
    const manager = await t.as("manager");
    expect((await manager.get("/metrics/boards/gm")).status).toBe(403);
    expect((await manager.get("/metrics/boards/sales")).status).toBe(200);
    const quality = await t.as("quality");
    expect((await quality.get("/metrics/definitions")).status).toBe(200);
    expect((await quality.get("/metrics/boards/sales")).status).toBe(403);
    const badTab = await sales.get("/metrics/boards/sales?tab=team");
    expect(badTab.status).toBe(422);
    expect(badTab.body.errcode).toBe("METRICS_TAB_UNKNOWN");
    expect((await sales.get("/metrics/boards/ceo")).status).toBe(422);
  });

  it("fills last week's snapshot from live data without overwriting existing ones", async () => {
    expect(t.app.get(Scheduler).list()).toContain("metrics.weekly-snapshot");
    const where = and(eq(metricSnapshots.metric, "confirmedAmount"), eq(metricSnapshots.scopeKey, "ALL"), eq(metricSnapshots.period, "week:2026-10-12"));
    const seeded = await t.app.get(MetricsService).snapshotLastWeek();
    expect(seeded).toMatchObject({ week: "2026-10-12", written: [] });
    expect((await t.db.select().from(metricSnapshots).where(where))[0]!.value).toBe(19.5);
    await t.db.delete(metricSnapshots).where(where);
    const filled = await t.app.get(MetricsService).snapshotLastWeek();
    expect(filled.written).toContain("confirmedAmount");
    expect((await t.db.select().from(metricSnapshots).where(where))[0]!.value).toBe(filled.confirmedWan);
  });
});
