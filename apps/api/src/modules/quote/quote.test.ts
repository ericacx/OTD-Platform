import { changeSnapshots, quoteCostItems, quoteRounds, quoteStrategies, quotes, styles, todos } from "@otd/db";
import { and, eq, inArray } from "drizzle-orm";
import ExcelJS from "exceljs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Scheduler } from "../../core/scheduler.js";
import { type Caller, type TestApp, createTestApp } from "../../testing/test-app.js";
import { QuoteService } from "./quote.service.js";

let t: TestApp;
beforeEach(async () => {
  t = await createTestApp({ now: "2026-10-21T01:00:00Z" });
});
afterEach(async () => {
  await t.close();
});

const VIDEO_COST_ITEMS = [
  { category: "YARN", name: "精梳棉 32S/1", quantity: 0.0178, unitPrice: 36 },
  { category: "YARN", name: "锦纶 70D/24F", quantity: 0.0046, unitPrice: 48 },
  { category: "YARN", name: "氨纶包覆纱 20D", quantity: 0.0022, unitPrice: 78 },
  { category: "YARN", name: "罗口橡筋线", quantity: 0.0015, unitPrice: 50 },
  { category: "LABOR", name: "织造", amount: 2.1 },
  { category: "LABOR", name: "缝头", amount: 0.85 },
  { category: "LABOR", name: "定型", amount: 0.68 },
  { category: "LABOR", name: "包装", amount: 0.6 },
  { category: "TRIMS", name: "卡头", quantity: 1, unitPrice: 0.18 },
  { category: "TRIMS", name: "挂钩", quantity: 1, unitPrice: 0.06 },
  { category: "TRIMS", name: "防滑硅胶", quantity: 1, unitPrice: 0.21 },
  { category: "TRIMS", name: "OPP 袋", quantity: 1, unitPrice: 0.07 },
  { category: "OTHER", name: "包材", amount: 1.2 },
  { category: "OTHER", name: "检测分摊", amount: 0.85 },
  { category: "OTHER", name: "物流", amount: 2.36 },
  { category: "OTHER", name: "管理费", amount: 5.6 },
];

async function styleId(styleNo: string, code: string) {
  return (await t.db.select().from(styles).where(and(eq(styles.styleNo, styleNo), eq(styles.customerId, t.refs.customers[code]!))))[0]!.id;
}

async function strategyId(code: string) {
  return (await t.db.select().from(quoteStrategies).where(eq(quoteStrategies.code, code)))[0]!.id;
}

async function seededQuoteId(styleNo: string, code = "NSR") {
  const sid = await styleId(styleNo, code);
  return (await t.db.select().from(quotes).where(eq(quotes.styleId, sid)))[0]!.id;
}

async function freshQuote(caller: Caller, styleNo = "12810") {
  const created = await caller.post("/quotes", {
    styleId: await styleId(styleNo, "NSR"),
    strategyId: await strategyId("PS-002"),
    moq: 2400,
    targetPriceUsd: 2.82,
    targetFx: 6.5,
    targetSource: "客户采购",
    targetDate: "2026-10-03",
    costItems: VIDEO_COST_ITEMS,
  });
  expect(created.status).toBe(201);
  return created.body.data;
}

describe("quotes: #12593 numbers", () => {
  it("seeded demo quote reproduces the video field by field", async () => {
    const sales = await t.as("sales");
    const res = await sales.get(`/quotes/${await seededQuoteId("12593")}`);
    expect(res.status).toBe(200);
    const q = res.body.data;
    expect(q.costTotal).toBe(16.09);
    expect(q.costBreakdown).toMatchObject({ yarn: 1.33, yarnLossRate: 0.2, labor: 4.23, trims: 0.52, other: 10.01 });
    expect(q.costItems.filter((i: { category: string }) => i.category === "YARN")).toHaveLength(4);
    expect([q.targetPriceUsd, q.targetFx, q.targetPriceCny]).toEqual([2.82, 6.5, 18.33]);
    expect(q.strategy).toMatchObject({ code: "PS-002", targetMargin: 0.18, guardrail: 0.12, lockedFx: 6.72, lossRate: 0.2, overheadRate: 0, moq: 10000, smallOrderUplift: 0.5 });
    expect(q.internalPrice).toEqual({ docNo: "QT-12593-01", priceCny: 19.31, priceUsd: 2.87 });
    expect(q.internalRounds[0]).toMatchObject({ strategyCode: "PS-001", margin: 0.1668, seq: 1, quantity: 2400 });
    expect(q.customerRounds.map((r: { docNo: string }) => r.docNo)).toEqual(["QT-12593-02", "QT-12593-03", "QT-12593-04"]);
    expect(q.customerRounds.map((r: { quantity: number }) => r.quantity)).toEqual([12000, 12000, 30000]);
    expect(q.customerRounds.map((r: { strategyCode: string }) => r.strategyCode)).toEqual(["PS-001", "PS-001", "PS-002"]);
    expect(q.customerRounds[0]).toMatchObject({ priceCny: 19.31, priceUsd: 2.87, diffToTargetUsd: 0.05, status: "LAPSED" });
    expect(q.latestCustomerRound).toMatchObject({ docNo: "QT-12593-04", seq: 3, isLatest: true, priceCny: 18.79, priceUsd: 2.8, diffToTargetUsd: -0.02, guardrailPassed: true, status: "QUOTED" });
    expect(Math.round(q.latestCustomerRound.margin * 1000) / 10).toBe(14.4);
    expect(q.status).toBe("QUOTED");
    expect(q.roundCounts).toEqual({ internal: 1, customer: 3 });
    expect(q.files.map((f: { filename: string }) => f.filename)).toContain("W27 BONDS RFQ 报价单.xlsx");
  });

  it("creates a quote, computes the internal round and customer rounds through the API", async () => {
    const sales = await t.as("sales");
    const q = await freshQuote(sales);
    expect(q.costTotal).toBe(16.09);
    expect(q.status).toBe("DRAFT");

    const internal = await sales.post(`/quotes/${q.id}/rounds`, { kind: "INTERNAL", quantity: 2400, strategyId: await strategyId("PS-001"), version: q.version });
    expect(internal.status).toBe(200);
    const afterInternal = internal.body.data;
    expect(afterInternal.internalRounds[0]).toMatchObject({ docNo: "QT-12810-01", priceCny: 19.31, priceUsd: 2.87, margin: 0.1668, status: "COST_REVIEW" });
    expect(afterInternal.internalRounds[0].pricing).toMatchObject({ basePrice: 19.31, upliftRate: 0, discountRate: 0 });
    expect(afterInternal.status).toBe("COST_REVIEW");

    const stale = await sales.post(`/quotes/${q.id}/rounds`, { kind: "CUSTOMER", quantity: 12000, priceCny: 19.31, version: q.version });
    expect(stale.body.errcode).toBe("COMMON_VERSION_CONFLICT");

    const preview = await sales.post("/quotes/preview", { quoteId: q.id, quantity: 30000, priceCny: 18.79 });
    expect(preview.status).toBe(200);
    expect(preview.body.data.check).toMatchObject({ priceUsd: 2.8, margin: 0.1437, guardrailPassed: true, targetMarginMet: false, belowMoq: false, diffToTargetUsd: -0.02, canSubmit: true });
    expect(preview.body.data.suggested).toMatchObject({ basePrice: 19.62, discountRate: 0.01, suggestedPrice: 19.43 });
    const small = await sales.post("/quotes/preview", { quoteId: q.id, strategyId: await strategyId("PS-001"), quantity: 1500 });
    expect(small.body.data.suggested).toMatchObject({ basePrice: 19.31, upliftRate: 0.5, suggestedPrice: 28.96 });

    const r2 = await sales.post(`/quotes/${q.id}/rounds`, { kind: "CUSTOMER", quantity: 12000, priceCny: 19.31, strategyId: await strategyId("PS-001"), version: afterInternal.version });
    expect(r2.body.data.latestCustomerRound).toMatchObject({ docNo: "QT-12810-02", priceUsd: 2.87, diffToTargetUsd: 0.05, status: "QUOTED" });
    expect(r2.body.data.internalRounds[0].status).toBe("QUOTED");
    const r3 = await sales.post(`/quotes/${q.id}/rounds`, { kind: "CUSTOMER", quantity: 30000, priceCny: 18.79, strategyId: await strategyId("PS-002"), note: "客户追加到 30000 双，改用大单进取档", version: r2.body.data.version });
    const d = r3.body.data;
    expect(d.latestCustomerRound).toMatchObject({ docNo: "QT-12810-03", seq: 2, priceCny: 18.79, priceUsd: 2.8, margin: 0.1437, diffToTargetUsd: -0.02, guardrailPassed: true });
    expect(d.customerRounds[0].status).toBe("LAPSED");
    expect(d.strategy.code).toBe("PS-002");
    expect(d.status).toBe("QUOTED");

    const open = await t.db.select().from(todos).where(eq(todos.docId, q.id));
    const byDoc = Object.fromEntries(open.map((x) => [x.docNo, x]));
    expect(byDoc["QT-12810-02"]!.status).toBe("DONE");
    expect(byDoc["QT-12810-03"]!.status).toBe("OPEN");
    expect(byDoc["QT-12810-03"]!.assigneeId).toBe(sales.userId);
    expect(byDoc["QT-12810-03"]!.dueAt!.toISOString()).toBe("2026-11-04T01:00:00.000Z");

    const dup = await sales.post("/quotes", { styleId: q.styleId, strategyId: await strategyId("PS-001") });
    expect(dup.body.errcode).toBe("QUOTE_STYLE_EXISTS");
  });
});

describe("quotes: guardrail", () => {
  it("blocks rounds below the guardrail unless an approver overrides with a reason", async () => {
    const sales = await t.as("sales");
    const q = await freshQuote(sales);
    const preview = await sales.post("/quotes/preview", { quoteId: q.id, quantity: 30000, priceCny: 17.5 });
    expect(preview.body.data.check).toMatchObject({ guardrailPassed: false, canOverride: false, canSubmit: false });

    const blocked = await sales.post(`/quotes/${q.id}/rounds`, { kind: "CUSTOMER", quantity: 30000, priceCny: 17.5, version: q.version });
    expect(blocked.status).toBe(422);
    expect(blocked.body.errcode).toBe("QUOTE_GUARDRAIL_VIOLATED");
    expect(blocked.body.errParams).toMatchObject({ margin: "8.1%", guardrail: "12.0%" });

    const manager = await t.as("manager");
    const noReason = await manager.post(`/quotes/${q.id}/rounds`, { kind: "CUSTOMER", quantity: 30000, priceCny: 17.5, version: q.version });
    expect(noReason.body.errcode).toBe("QUOTE_OVERRIDE_REASON_REQUIRED");
    const ok = await manager.post(`/quotes/${q.id}/rounds`, { kind: "CUSTOMER", quantity: 30000, priceCny: 17.5, overrideReason: "战略客户首单，经理批准", version: q.version });
    expect(ok.status).toBe(200);
    expect(ok.body.data.latestCustomerRound).toMatchObject({ guardrailPassed: false, overrideReason: "战略客户首单，经理批准", overrideApprovedBy: manager.userId, status: "QUOTED" });
  });
});

describe("quotes: feedback, lapse, archive", () => {
  it("accepts only the latest customer round and rejects illegal transitions", async () => {
    const sales = await t.as("sales");
    const id = await seededQuoteId("12593");
    const q = (await sales.get(`/quotes/${id}`)).body.data;
    const [r2, , r4] = q.customerRounds;
    expect((await sales.post(`/quotes/${id}/rounds/${r2.id}/feedback`, { result: "ACCEPTED", version: r2.version })).body.errcode).toBe("QUOTE_NOT_LATEST_ROUND");
    expect((await sales.post(`/quotes/${id}/rounds/${q.internalRounds[0].id}/feedback`, { result: "ACCEPTED", version: q.internalRounds[0].version })).body.errcode).toBe("FLOW_ILLEGAL_TRANSITION");
    expect((await sales.post(`/quotes/${id}/rounds/${r4.id}/feedback`, { result: "ACCEPTED", version: r4.version + 5 })).body.errcode).toBe("COMMON_VERSION_CONFLICT");
    const accepted = await sales.post(`/quotes/${id}/rounds/${r4.id}/feedback`, { result: "ACCEPTED", note: "客户邮件确认", version: r4.version });
    expect(accepted.status).toBe(200);
    expect(accepted.body.data.status).toBe("ACCEPTED");
    expect(accepted.body.data.latestCustomerRound).toMatchObject({ status: "ACCEPTED", feedbackNote: "客户邮件确认" });
    const again = await sales.post(`/quotes/${id}/rounds/${r4.id}/feedback`, { result: "REJECTED", version: accepted.body.data.latestCustomerRound.version });
    expect(again.body.errcode).toBe("FLOW_ILLEGAL_TRANSITION");
  });

  it("lapses customer rounds without feedback after 14 days via the daily job", async () => {
    expect(t.app.get(Scheduler).list()).toContain("quote.lapse-unanswered");
    const sales = await t.as("sales");
    const q = await freshQuote(sales);
    const r = await sales.post(`/quotes/${q.id}/rounds`, { kind: "CUSTOMER", quantity: 12000, priceCny: 19.31, version: q.version });
    const roundId = r.body.data.latestCustomerRound.id;
    const service = t.app.get(QuoteService);
    expect((await service.lapseUnanswered()).lapsed).not.toContain("QT-12810-01");
    t.clock.advanceDays(15);
    const result = await service.lapseUnanswered();
    expect(result.lapsed).toContain("QT-12810-01");
    t.clock.set("2026-10-21T01:05:00Z");
    const afterRes = await sales.get(`/quotes/${q.id}`);
    expect(afterRes.body).toMatchObject({ errcode: 0 });
    const after = afterRes.body.data;
    expect(after.customerRounds.find((x: { id: string }) => x.id === roundId).status).toBe("LAPSED");
    expect(after.status).toBe("LAPSED");
    const todo = (await t.db.select().from(todos).where(eq(todos.fingerprint, `quote.round:${roundId}:feedback`)))[0]!;
    expect(todo.status).toBe("DONE");
    const feedback = await sales.post(`/quotes/${q.id}/rounds/${roundId}/feedback`, { result: "ACCEPTED", version: after.customerRounds[0].version });
    expect(feedback.body.errcode).toBe("FLOW_ILLEGAL_TRANSITION");
  });

  it("archives a quote and blocks further rounds; frozen styles reject edits", async () => {
    const sales = await t.as("sales");
    const id = await seededQuoteId("12593");
    const q = (await sales.get(`/quotes/${id}`)).body.data;
    const archived = await sales.post(`/quotes/${id}/archive`, { version: q.version });
    expect(archived.status).toBe(200);
    expect(archived.body.data.archivedAt).toBe("2026-10-21T01:00:00.000Z");
    expect((await sales.post(`/quotes/${id}/archive`, { version: archived.body.data.version })).body.errcode).toBe("QUOTE_ARCHIVED");
    const round = await sales.post(`/quotes/${id}/rounds`, { kind: "CUSTOMER", quantity: 30000, priceCny: 19, version: archived.body.data.version });
    expect(round.body.errcode).toBe("QUOTE_ARCHIVED");
    const list = (await sales.get("/quotes?keyword=12593")).body.data;
    expect(list.total).toBe(0);
    expect((await sales.get("/quotes?keyword=12593&archived=true")).body.data.total).toBe(1);

    const frozenId = await seededQuoteId("11506");
    const frozen = (await sales.get(`/quotes/${frozenId}`)).body.data;
    expect(frozen.handoverStatus).toBe("HANDED_OVER");
    expect((await sales.put(`/quotes/${frozenId}`, { note: "x", version: frozen.version })).body.errcode).toBe("QUOTE_FROZEN");
  });
});

describe("quotes: permissions and scope", () => {
  it("returns 403 without the menu permission and 404 outside the data scope", async () => {
    const planner = await t.as("planner");
    expect((await planner.get("/quotes")).status).toBe(403);
    const sales = await t.as("sales");
    expect((await sales.post("/quote-strategies", {})).status).toBe(403);
    const id = await seededQuoteId("12593");
    const other = await t.as("sales3");
    expect((await other.get(`/quotes/${id}`)).status).toBe(404);
    const otherList = (await other.get("/quotes?pageSize=100")).body.data;
    expect(otherList.items.map((i: { styleNo: string }) => i.styleNo)).not.toContain("12593");
    expect((await other.post(`/quotes/${id}/archive`, { version: 1 })).status).toBe(404);
    const manager = await t.as("manager");
    expect((await manager.get(`/quotes/${id}`)).status).toBe(200);
  });

  it("lists visible styles for pickers with their quote and handover links", async () => {
    const sales = await t.as("sales");
    const options = (await sales.get("/quotes/style-options?keyword=12")).body.data;
    const byNo = Object.fromEntries(options.map((o: { styleNo: string }) => [o.styleNo, o]));
    expect(byNo["12593"]).toMatchObject({ customerName: "北岸运动", quoteId: await seededQuoteId("12593") });
    expect(byNo["12593"].handoverId).toBeTruthy();
    expect(byNo["12810"]).toMatchObject({ quoteId: null, handoverId: null });
    expect(byNo["11063"]).toBeUndefined();
    expect((await (await t.as("planner")).get("/quotes/style-options")).status).toBe(403);
  });

  it("drops cost, margin and internal price fields for callers without quote.cost.view", async () => {
    const admin = await t.as("admin");
    const roles = (await admin.get("/system/roles")).body.data;
    const quality = (Array.isArray(roles) ? roles : roles.items).find((r: { code: string }) => r.code === "R005");
    const detail = (await admin.get(`/system/roles/${quality.id}`)).body.data;
    const granted = await admin.put(`/system/roles/${quality.id}/grants`, { permissions: [...detail.permissions, "quote.quote.view", "quote.quote.submit"], allCustomers: true, customerIds: [], version: detail.version });
    expect(granted.status).toBe(200);
    const widened = await admin.put(`/system/roles/${quality.id}`, { name: detail.name, nameEn: detail.nameEn, type: detail.type, dataScope: "ALL", version: granted.body.data.version });
    expect(widened.status).toBe(200);

    const id = await seededQuoteId("12593");
    const inspector = await t.as("quality");
    const res = await inspector.get(`/quotes/${id}`);
    expect(res.status).toBe(200);
    const q = res.body.data;
    for (const key of ["costTotal", "costBreakdown", "costItems", "internalRounds", "internalPrice"]) expect(q).not.toHaveProperty(key);
    expect(q.customerRounds).toHaveLength(3);
    for (const key of ["margin", "costTotal", "pricing"]) expect(q.latestCustomerRound).not.toHaveProperty(key);
    expect(q.latestCustomerRound.priceUsd).toBe(2.8);
    expect(q.roundCounts).toEqual({ internal: 1, customer: 3 });

    const list = (await inspector.get("/quotes?keyword=12593")).body.data.items[0];
    expect(list).not.toHaveProperty("latestMargin");
    expect(list.latestDocNo).toBe("QT-12593-04");

    const preview = (await inspector.post("/quotes/preview", { quoteId: id, quantity: 30000, priceCny: 18.79 })).body.data;
    expect(preview).not.toHaveProperty("costTotal");
    expect(preview).not.toHaveProperty("suggested");
    expect(preview.check).not.toHaveProperty("margin");
    expect(preview.check.guardrailPassed).toBe(true);

    expect((await inspector.post(`/quotes/${id}/rounds`, { kind: "INTERNAL", quantity: 12000, version: q.version })).status).toBe(403);
    expect((await inspector.get(`/quotes/${id}/export/cost-detail`)).status).toBe(403);
    const low = await inspector.post(`/quotes/${id}/rounds`, { kind: "CUSTOMER", quantity: 30000, priceCny: 17.5, version: q.version });
    expect(low.status).toBe(422);
    expect(low.body.errcode).toBe("QUOTE_GUARDRAIL_VIOLATED");
    expect(low.body.errParams).not.toHaveProperty("margin");
    expect(low.body.errParams).not.toHaveProperty("marginRate");
    expect(low.body.errmsg).toBe("毛利率低于护栏 12.0%，不能生成报价");

    const fastify = t.app.getHttpAdapter().getInstance();
    const exported = await fastify.inject({ method: "GET", url: `/api/v1/quotes/${id}/export/summary`, headers: { authorization: `Bearer ${inspector.token}` } });
    expect(exported.statusCode).toBe(200);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(exported.rawPayload as unknown as ArrayBuffer);
    const cells: string[] = [];
    wb.worksheets[0]!.eachRow((row) => row.eachCell((cell) => cells.push(String(cell.value))));
    expect(cells).toContain("QT-12593-04");
    expect(cells).not.toContain("QT-12593-01");
    expect(cells).not.toContain("毛利率");

    const sales = await t.as("sales");
    const full = (await sales.get(`/quotes/${id}`)).body.data;
    expect(full.costTotal).toBe(16.09);
    expect(full.latestCustomerRound).toHaveProperty("margin");
  });
});

describe("quotes: strategies and export", () => {
  it("bumps the strategy version with a snapshot while rounds keep their parameters", async () => {
    const manager = await t.as("manager");
    const strategies = (await manager.get("/quote-strategies")).body.data;
    const ps1 = strategies.find((s: { code: string }) => s.code === "PS-001");
    expect(ps1.usedBy).toBeGreaterThan(0);
    const { id, code: _c, usedBy: _u, updatedAt: _a, version, ...params } = ps1;
    const updated = await manager.put(`/quote-strategies/${id}`, { ...params, markupRate: 0.25, reason: "原料涨价", version });
    expect(updated.status).toBe(200);
    expect(updated.body.data).toMatchObject({ markupRate: 0.25, version: version + 1 });
    expect((await manager.put(`/quote-strategies/${id}`, { ...params, version })).body.errcode).toBe("COMMON_VERSION_CONFLICT");
    const snaps = await t.db.select().from(changeSnapshots).where(and(eq(changeSnapshots.objectType, "quoteStrategy"), eq(changeSnapshots.objectId, id)));
    expect(snaps).toHaveLength(1);
    expect((snaps[0]!.snapshot as { markupRate: number }).markupRate).toBe(0.2);

    const q = (await manager.get(`/quotes/${await seededQuoteId("12593")}`)).body.data;
    expect(q.internalRounds[0].strategy).toMatchObject({ code: "PS-001", markupRate: 0.2, version: 1 });
    const preview = await manager.post("/quotes/preview", { quoteId: q.id, strategyId: id, quantity: 12000 });
    expect(preview.body.data.suggested.suggestedPrice).toBe(20.11);

    const created = await manager.post("/quote-strategies", { ...params, name: "试点策略", markupRate: 0.3 });
    expect(created.status).toBe(201);
    expect(created.body.data.code).toBe("PS-004");
  });

  it("exports the quote summary and cost detail as Excel files", async () => {
    const sales = await t.as("sales");
    const id = await seededQuoteId("12593");
    const fastify = t.app.getHttpAdapter().getInstance();
    for (const form of ["summary", "cost-detail"]) {
      const res = await fastify.inject({ method: "GET", url: `/api/v1/quotes/${id}/export/${form}`, headers: { authorization: `Bearer ${sales.token}` } });
      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toContain("spreadsheetml");
      expect(String(res.headers["content-disposition"])).toContain("attachment");
      expect(res.rawPayload.subarray(0, 2).toString()).toBe("PK");
    }
    const bad = await sales.get(`/quotes/${id}/export/costing-sheet`);
    expect(bad.status).toBe(422);
  });
});

describe("quotes: cost item editing", () => {
  it("replaces cost items and recalculates the total", async () => {
    const sales = await t.as("sales");
    const empty = (await sales.post("/quotes", { styleId: await styleId("12810", "NSR"), strategyId: await strategyId("PS-002") })).body.data;
    expect((await sales.post("/quotes/preview", { quoteId: empty.id, quantity: 1000, priceCny: 10 })).body.errcode).toBe("QUOTE_COST_MISSING");
    expect((await sales.post(`/quotes/${empty.id}/rounds`, { kind: "CUSTOMER", quantity: 1000, priceCny: 10, version: empty.version })).body.errcode).toBe("QUOTE_COST_MISSING");
    await t.db.delete(quotes).where(eq(quotes.id, empty.id));
    const q = await freshQuote(sales);
    const updated = await sales.put(`/quotes/${q.id}`, { costItems: VIDEO_COST_ITEMS.filter((i) => i.category !== "OTHER"), version: q.version });
    expect(updated.status).toBe(200);
    expect(updated.body.data.costTotal).toBe(6.08);
    const rows = await t.db.select().from(quoteCostItems).where(inArray(quoteCostItems.quoteId, [q.id]));
    expect(rows).toHaveLength(12);
    const rounds = await t.db.select().from(quoteRounds).where(eq(quoteRounds.quoteId, q.id));
    expect(rounds).toHaveLength(0);
  });
});
