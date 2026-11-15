import { customerFlowVersions, customerFlows, customerOrders, domainEvents, handoverPackages, inspections, nodeStateSnapshots, patrolHits, patrolRules, plannings, purchaseOrders } from "@otd/db";
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EventBus } from "../../core/events.js";
import { type TestApp, createTestApp } from "../../testing/test-app.js";
import { factoryIdOf, makeStyle } from "../order/order.fixtures.js";

let t: TestApp;
beforeEach(async () => {
  t = await createTestApp({ demo: false, now: "2026-10-21T01:00:00Z" });
});
afterEach(async () => {
  await t.close();
});

async function order(poNo: string, styleIds: string[], extra: Record<string, unknown> = {}) {
  const sales = await t.as("sales");
  const res = await sales.post("/orders", { customerId: t.refs.customers.NSR, poNo, customerDueDate: "2026-12-16", orderDate: "2026-10-18", factoryId: await factoryIdOf(t, "NH5"), transportMode: "RAIL", lines: styleIds.map((styleId) => ({ styleId, quantity: 1200, unitPrice: 0.9 })), ...extra });
  expect(res.status).toBe(201);
  return res.body.data;
}

async function snapshot(orderId: string, node: string) {
  return (await t.db.select().from(nodeStateSnapshots).where(and(eq(nodeStateSnapshots.orderId, orderId), eq(nodeStateSnapshots.nodeCode, node))))[0];
}

const own = () => ({ ownerId: t.refs.users["13800000001"]!, orgId: t.refs.orgs.ORG003!, customerId: t.refs.customers.NSR! });

describe("mainline · order monitor", () => {
  it("shows base info and the 10-node timeline for a PO number", async () => {
    const a = await makeStyle(t, "11506", { handedOver: true, acceptedUsd: 0.9 });
    const b = await makeStyle(t, "12810", { handedOver: true, acceptedUsd: 0.9 });
    const o = await order("PO0097001", [a, b]);
    const sales = await t.as("sales");
    const res = await sales.get("/orders/monitor?poNo=po0097001");
    expect(res.status).toBe(200);
    const { order: info, mainline } = res.body.data;
    expect(info).toMatchObject({ id: o.id, poNo: "PO0097001", customerName: "北岸运动", seasonCode: null, styleSummary: "#11506 等 2 款", totalPairs: 2400, customerDueDate: "2026-12-16", factoryName: "南湖五厂", status: "PENDING_CONFIRM" });
    expect(mainline.nodes.map((n: { code: string }) => n.code)).toEqual(["N01", "N02", "N03", "N04", "N05", "N06", "N07", "N08", "N09", "N10"]);
    expect(mainline.nodes.map((n: { state: string }) => n.state)).toEqual(["DONE", "DONE", "DONE", "DONE", "DONE", "IN_PROGRESS", "NOT_STARTED", "NOT_STARTED", "NOT_STARTED", "NOT_STARTED"]);
    expect(mainline).toMatchObject({ completedCount: 5, total: 10, currentNode: "N06", closed: false, headline: { zh: "已完成 5 / 10 步 · 当前节点：PO 复核" } });
    const n06 = mainline.nodes[5];
    expect(n06).toMatchObject({ name: { zh: "PO 复核" }, gate: null, link: `/orders/${o.id}`, summary: { zh: "PO PO0097001 待复核 · 规则包校验全绿，一键确认" }, enteredAt: "2026-10-21T01:00:00.000Z" });
    expect(mainline.nodes[4].gate).toBe("G1");
    expect(mainline.nodes[8].gate).toBe("G2");
    expect(mainline.nodes[0].styles).toEqual([
      { styleNo: "11506", state: "DONE" },
      { styleNo: "12810", state: "DONE" },
    ]);
    expect(mainline.nodes[7].summary.zh).toContain("南湖五厂承做");

    const direct = await sales.get(`/orders/${o.id}/mainline`);
    expect(direct.body.data.headline).toEqual(mainline.headline);
    expect((await sales.get("/orders/monitor?poNo=PO404")).status).toBe(404);
    expect((await (await t.as("sales3")).get("/orders/monitor?poNo=PO0097001")).status).toBe(404);
    expect((await (await t.as("sales3")).get(`/orders/${o.id}/mainline`)).status).toBe(404);
    expect((await (await t.as("quality")).get("/orders/monitor?poNo=PO0097001")).status).toBe(403);
    expect((await sales.get("/orders/monitor")).body.errcode).toBe("COMMON_VALIDATION_FAILED");
  });
});

describe("mainline · customer flow configuration", () => {
  it("reads enabled nodes from the customer flow and recomputes after an order is migrated to another version", async () => {
    const styleId = await makeStyle(t, "F7001", { handedOver: true, acceptedUsd: 0.9 });
    const o = await order("PO0097501", [styleId]);
    expect((await snapshot(o.id, "N03"))?.state).toBe("DONE");

    const modules = ["SM01", "SM03", "SM08", "SM09", "SM10", "SM11"].map((moduleCode, i) => ({ moduleCode, sort: i + 1, department: "业务部", items: [{ itemCode: `${moduleCode}-01` }] }));
    const versionId = (await t.db.insert(customerFlowVersions).values({ customerId: t.refs.customers.NSR!, versionNo: 1, snapshot: { modules, params: {} } }).returning({ id: customerFlowVersions.id }))[0]!.id;
    await t.db.insert(customerFlows).values({ customerId: t.refs.customers.NSR!, currentVersionId: versionId, draft: { modules, params: {} }, status: "PUBLISHED" });
    await t.db.update(customerOrders).set({ flowVersionId: versionId }).where(eq(customerOrders.id, o.id));
    await t.app.get(EventBus).publish([{ type: "flow.order.migrated", aggregateType: "customerOrder", aggregateId: o.id, payload: { toVersionId: versionId } }]);
    expect((await snapshot(o.id, "N03"))?.state).toBe("NOT_APPLICABLE");

    const sales = await t.as("sales");
    const before = (await sales.get(`/orders/${o.id}/mainline`)).body.data;
    const state = (m: { nodes: { code: string; state: string }[] }, code: string) => m.nodes.find((n) => n.code === code)!.state;
    expect(["N03", "N04", "N09"].map((c) => state(before, c))).toEqual(["NOT_APPLICABLE", "NOT_APPLICABLE", "NOT_APPLICABLE"]);
    expect(state(before, "N05")).toBe("DONE");
    expect(state(before, "N07")).toBe("NOT_STARTED");
    expect(before.completedCount).toBe(6);

    const fresh = (await sales.get(`/orders/${o.id}`)).body.data;
    const confirmed = (await sales.post(`/orders/${o.id}/confirm`, { version: fresh.version })).body.data;
    expect(confirmed.flowVersionId).toBe(versionId);
    expect(await snapshot(o.id, "N07")).toMatchObject({ state: "IN_PROGRESS", summary: "采购单未下达" });
    const pur = (await t.db.insert(purchaseOrders).values({ docNo: "PUR-2610-901", orderId: o.id, supplier: "华茂纱业", category: "YARN", status: "ORDERED", orderedAt: "2026-10-21", ...own() }).returning({ id: purchaseOrders.id }))[0]!;
    await t.app.get(EventBus).publish([{ type: "purchase.order.created", aggregateType: "purchase", aggregateId: pur.id }]);
    expect(await snapshot(o.id, "N07")).toMatchObject({ state: "DONE", summary: "采购单 1 张已下达" });
  });
});

describe("mainline · recompute on events", () => {
  it("writes snapshots and refreshes them when upstream modules publish events", async () => {
    const styleId = await makeStyle(t, "M8001");
    const o = await order("PO0098001", [styleId]);
    expect((await snapshot(o.id, "N01"))?.state).toBe("NOT_STARTED");
    expect((await snapshot(o.id, "N06"))?.state).toBe("BLOCKED");
    expect((await snapshot(o.id, "N06"))?.blockedReasons.join("|")).toContain("款号均已完成开发移交");

    const bus = t.app.get(EventBus);
    const planning = (await t.db.insert(plannings).values({ docNo: "BR-2610-901", styleId, styleNo: "M8001", seasonCode: "AW26", status: "CONFIRMED", ...own() }).returning({ id: plannings.id }))[0]!;
    await bus.publish([{ type: "planning.planning.confirmed", aggregateType: "planning", aggregateId: planning.id }]);
    expect((await snapshot(o.id, "N01"))).toMatchObject({ state: "DONE", summary: "AW26 企划 BR-2610-901 已确认（#M8001）" });
    expect((await snapshot(o.id, "N02"))?.state).toBe("IN_PROGRESS");

    await t.db.insert(handoverPackages).values({ docNo: "DH-2610-901", styleId, status: "HANDED_OVER", checklist: {}, ...own() });
    await bus.publish([{ type: "document.handover.completed", aggregateType: "somethingElse", aggregateId: "not-a-uuid", payload: { styleId } }]);
    expect((await snapshot(o.id, "N05"))?.state).toBe("DONE");
    expect((await snapshot(o.id, "N02"))?.state).toBe("DONE");

    const sales = await t.as("sales");
    const fresh = (await sales.get(`/orders/${o.id}`)).body.data;
    const confirmed = await sales.post(`/orders/${o.id}/confirm`, { version: fresh.version, overrideReason: "已人工核对" });
    expect(confirmed.status).toBe(200);
    expect((await snapshot(o.id, "N06"))?.state).toBe("DONE");
    expect((await snapshot(o.id, "N07"))?.state).toBe("IN_PROGRESS");

    const insp = (await t.db.insert(inspections).values({ docNo: "INSP-2610-901", orderId: o.id, stage: "FRI", status: "INSPECTED", result: "FAIL", roundNo: 2, ...own() }).returning({ id: inspections.id }))[0]!;
    await bus.publish([{ type: "inspection.inspection.recorded", aggregateType: "inspection", aggregateId: insp.id }]);
    const n09 = await snapshot(o.id, "N09");
    expect(n09?.state).toBe("BLOCKED");
    expect(n09?.blockedReasons).toEqual(["INSP-2610-901 尾验第 2 轮不合格，待整改复验"]);

    const failures = (await t.db.select().from(domainEvents)).filter((e) => e.lastError);
    expect(failures).toEqual([]);
  });

  it("blocks a node when an open red patrol hit targets it", async () => {
    const styleId = await makeStyle(t, "M8002", { handedOver: true, acceptedUsd: 0.9 });
    const o = await order("PO0098002", [styleId]);
    expect((await snapshot(o.id, "N06"))?.state).toBe("IN_PROGRESS");
    const rule = (await t.db.select().from(patrolRules).where(eq(patrolRules.code, "IR-009")))[0]!;
    const hit = (
      await t.db
        .insert(patrolHits)
        .values({ ruleId: rule.id, lastRunId: rule.id, module: "M09", targetType: "order", targetId: o.id, targetNo: o.poNo, light: "RED", severity: "HIGH", message: { zh: "PO 待复核超期 4 天", en: "PO review overdue 4 days" }, fingerprint: `IR-009:${o.id}` })
        .returning({ id: patrolHits.id })
    )[0]!;
    await t.app.get(EventBus).publish([{ type: "patrol.hit.opened", aggregateType: "patrolHit", aggregateId: hit.id }]);
    expect(await snapshot(o.id, "N06")).toMatchObject({ state: "BLOCKED", blockedReasons: ["PO 待复核超期 4 天"] });
    const risk = (await (await t.as("sales")).get("/orders?risk=1")).body.data.items.map((i: { poNo: string }) => i.poNo);
    expect(risk).toEqual(["PO0098002"]);
  });
});

describe("mainline · global search", () => {
  it("searches PO numbers, styles and doc numbers within permission and data scope", async () => {
    const styleId = await makeStyle(t, "S9001", { handedOver: true });
    const o = await order("PO0099001", [styleId]);
    await t.db.insert(inspections).values({ docNo: "INSP-2610-777", orderId: o.id, stage: "FRI", status: "TO_SCHEDULE", ...own() });
    const sales = await t.as("sales");
    const hits = (await sales.get("/search?q=PO00990")).body.data;
    expect(hits).toEqual([{ type: "order", id: o.id, docNo: "PO0099001", title: "PO0099001 · 北岸运动 · 1,200 双", link: `/orders/${o.id}` }]);
    const style = (await sales.get("/search?q=%23S9001")).body.data;
    expect(style[0]).toMatchObject({ type: "style", docNo: "S9001", link: "/orders?keyword=S9001" });
    expect((await sales.get("/search?q=DH-T-S9001")).body.data.map((h: { type: string }) => h.type)).toEqual(["handover"]);
    expect((await sales.get("/search?q=INSP-2610-777")).body.data[0]).toMatchObject({ type: "inspection", link: expect.stringMatching(/^\/inspections\//) });

    expect((await (await t.as("sales3")).get("/search?q=PO00990")).body.data).toEqual([]);
    const quality = (await (await t.as("quality")).get("/search?q=2610-777")).body.data;
    expect(quality.map((h: { type: string }) => h.type)).toEqual(["inspection"]);
    expect((await (await t.as("quality")).get("/search?q=PO0099001")).body.data).toEqual([]);
    const admin = (await (await t.as("admin")).get("/search?q=北岸")).body.data;
    expect(admin[0]).toMatchObject({ type: "customer", docNo: "NSR", link: `/orders?customerId=${t.refs.customers.NSR}` });
    expect((await t.anon.get("/search?q=PO")).status).toBe(401);
  });
});

describe("mainline · demo seed smoke", () => {
  it("serves the seeded orders with history, monitor timeline and demo todos", async () => {
    await t.close();
    t = await createTestApp({ now: "2026-10-21T01:00:00Z" });
    const admin = await t.as("admin");
    const monitor = (await admin.get("/orders/monitor?poNo=PO0010459")).body.data;
    expect(monitor.order).toMatchObject({ poNo: "PO0010459", styleSummary: "#11506 等 2 款", totalPairs: 37080, status: "PENDING_CONFIRM" });
    expect(monitor.mainline.nodes).toHaveLength(10);
    expect(["IN_PROGRESS", "BLOCKED"]).toContain(monitor.mainline.nodes[5].state);

    const list = (await admin.get("/orders?pageSize=50")).body.data;
    expect(list.items.map((i: { poNo: string }) => i.poNo)).toEqual(expect.arrayContaining(["PO0010459", "PO0009631", "PO0009412", "PO0009690", "PO0009745", "PO0009560", "PO0009702", "PO0010035"]));
    const inProduction = list.items.find((i: { poNo: string }) => i.poNo === "PO0009631");
    const detail = (await admin.get(`/orders/${inProduction.id}`)).body.data;
    expect(detail).toMatchObject({ status: "IN_PRODUCTION", revision: 2, stageIndex: 3 });
    expect(detail.revisions[0]).toMatchObject({ revision: 1, note: "客户追加 600 双（Rev.2）" });
    expect(detail.factoryReplies.map((r: { versionNo: number }) => r.versionNo)).toEqual([2, 1]);
    expect(detail.production[0].completionRate).toBe(0.12);
    expect(detail.stages.map((s: { state: string }) => s.state)).toEqual(["DONE", "DONE", "CURRENT", "PENDING", "PENDING"]);
    expect(detail.stages[2].logs[0].action).toBe("排产确认，进入「生产中」");

    for (const item of list.items as { id: string; poNo: string }[]) {
      const res = await admin.get(`/orders/${item.id}/mainline`);
      expect({ po: item.poNo, status: res.status, nodes: res.body.data.nodes.length }).toEqual({ po: item.poNo, status: 200, nodes: 10 });
    }
    const snapshots = await t.db.select().from(nodeStateSnapshots);
    expect(snapshots.length).toBe(list.items.length * 10);
    const completed = list.items.find((i: { poNo: string }) => i.poNo === "PO0009745");
    expect((await admin.get(`/orders/${completed.id}/mainline`)).body.data.nodes.slice(5).map((n: { state: string }) => n.state)).toEqual(["DONE", "DONE", "DONE", "DONE", "DONE"]);
    const pending = (await admin.get(`/orders/${list.items.find((i: { poNo: string }) => i.poNo === "PO0010459").id}`)).body.data;
    expect(pending.ruleCheck).toHaveLength(5);
    expect(pending.stages[0].logs[0]).toMatchObject({ operatorName: "系统识别" });

    const board = (await (await t.as("sales")).get("/todos/board")).body.data;
    expect(board.overdue.some((i: { docType: string }) => i.docType === "order")).toBe(true);
    expect(board.today.some((i: { docType: string }) => i.docType === "order")).toBe(true);
    expect(board.later.some((i: { docType: string }) => i.docType === "order")).toBe(true);
    const overview = (await (await t.as("sales")).get("/todos/overview")).body.data;
    expect(overview.kpis.activeOrders).toBeGreaterThanOrEqual(2);
  });
});
