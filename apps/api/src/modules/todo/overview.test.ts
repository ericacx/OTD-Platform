import { bookings, inspections, sampleRounds, samples } from "@otd/db";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type TestApp, createTestApp } from "../../testing/test-app.js";
import { insertOrder, makeStyle } from "../order/order.fixtures.js";
import { TodoService } from "./todo.service.js";

let t: TestApp;
beforeEach(async () => {
  t = await createTestApp({ demo: false, now: "2026-10-21T01:00:00Z" });
});
afterEach(async () => {
  await t.close();
});

describe("today overview (M00)", () => {
  it("summarises KPIs, distributions, focus counts and due reminders within the user's scope", async () => {
    const sales = await t.as("sales");
    const own = { ownerId: sales.userId, orgId: t.refs.orgs.ORG003!, customerId: t.refs.customers.NSR! };
    const a = await insertOrder(t, { poNo: "PO-A", status: "PENDING_CONFIRM", due: "2026-11-10", pairs: 37080 });
    const b = await insertOrder(t, { poNo: "PO-B", status: "IN_PRODUCTION", due: "2026-10-15", pairs: 12600, customer: "MRN", factoryReplyDate: "2026-10-15", delayDays: 0 });
    await insertOrder(t, { poNo: "PO-C", status: "TO_SHIP", due: "2026-12-30", pairs: 8000 });
    await insertOrder(t, { poNo: "PO-D", status: "COMPLETED", due: "2026-09-01", pairs: 4200 });
    await insertOrder(t, { poNo: "PO-E", status: "CANCELLED", due: "2026-11-01", pairs: 1000 });
    await insertOrder(t, { poNo: "PO-F", status: "TO_SCHEDULE", due: "2026-11-01", pairs: 9600, customer: "APX", owner: "13800000005", org: "ORG004" });

    const styleA = await makeStyle(t, "K1001");
    const styleB = await makeStyle(t, "K1002");
    const s1 = (await t.db.insert(samples).values({ docNo: "SP-2610-901", styleId: styleA, ...own }).returning({ id: samples.id }))[0]!;
    const s2 = (await t.db.insert(samples).values({ docNo: "SP-2610-902", styleId: styleB, ...own }).returning({ id: samples.id }))[0]!;
    await t.db.insert(sampleRounds).values([
      { sampleId: s1.id, roundNo: 1, roundType: "PROTO", status: "REVISE" },
      { sampleId: s1.id, roundNo: 2, roundType: "SMS", status: "KNITTING" },
      { sampleId: s2.id, roundNo: 1, roundType: "SMS", status: "APPROVED" },
    ]);
    await t.db.insert(bookings).values([
      { docNo: "BK-2610-901", orderId: b, status: "PENDING_CARRIER", etd: "2026-10-01", ...own },
      { docNo: "BK-2610-902", orderId: b, status: "CONFIRMED", etd: "2026-10-30", ...own },
      { docNo: "BK-2610-903", orderId: b, status: "CANCELLED", etd: "2026-10-02", ...own },
    ]);
    await t.db.insert(inspections).values({ docNo: "INSP-2610-901", orderId: a, stage: "FRI", status: "SCHEDULED", plannedDate: "2026-10-25", ...own });

    const todos = t.app.get(TodoService);
    await todos.upsert({ fingerprint: "x1", source: "FLOW", action: "order.review", title: "复核客户 PO", docType: "order", assigneeId: sales.userId, dueAt: new Date("2026-10-19T09:00:00Z") });
    await todos.upsert({ fingerprint: "x2", source: "FLOW", action: "test.arrange", title: "安排送测", docType: "testRequest", assigneeId: sales.userId, dueAt: new Date("2026-10-25T09:00:00Z") });

    const res = await sales.get("/todos/overview");
    expect(res.status).toBe(200);
    const o = res.body.data;
    expect(o.greeting).toEqual({ userName: "王芳", today: "2026-10-21", weekday: 3, dataScope: "SELF", allCustomers: false });
    expect(o.kpis).toEqual({ todos: { total: 2, byDocType: { order: 1, testRequest: 1 } }, activeOrders: 3, samplingStyles: 1, dueSoonOrders: 2 });
    expect(o.customerDistribution).toEqual([
      { customerId: t.refs.customers.NSR, customerName: "北岸运动", orders: 2, pairs: 45080, pairsWan: 4.51 },
      { customerId: t.refs.customers.MRN, customerName: "晨跑者", orders: 1, pairs: 12600, pairsWan: 1.26 },
    ]);
    expect(o.statusDistribution).toEqual([
      { status: "IN_PRODUCTION", count: 1 },
      { status: "COMPLETED", count: 1 },
      { status: "PENDING_CONFIRM", count: 1 },
      { status: "TO_SCHEDULE", count: 0 },
      { status: "TO_SHIP", count: 1 },
    ]);
    expect(o.focus).toEqual({
      pendingConfirmOrders: { count: 1, link: "/orders?status=PENDING_CONFIRM" },
      pendingBookings: { count: 1, link: "/shipments/bookings?status=PENDING_CARRIER" },
      toShipOrders: { count: 1, link: "/orders?status=TO_SHIP" },
      riskOrders: { count: 1, link: "/orders?risk=1" },
    });
    expect(o.dueReminders.map((r: { kind: string; docNo: string; daysLeft: number }) => [r.kind, r.docNo, r.daysLeft])).toEqual([
      ["ETD", "BK-2610-901", -20],
      ["CUSTOMER_DUE", "PO-B", -6],
      ["FACTORY_DUE", "PO-B", -6],
      ["FINAL_INSPECTION", "INSP-2610-901", 4],
      ["ETD", "BK-2610-902", 9],
      ["CUSTOMER_DUE", "PO-A", 20],
    ]);

    const manager = (await (await t.as("manager")).get("/todos/overview")).body.data;
    expect(manager.kpis.activeOrders).toBe(4);
    expect(manager.greeting).toMatchObject({ dataScope: "ORG_AND_CHILDREN", allCustomers: true });
    const other = (await (await t.as("sales3")).get("/todos/overview")).body.data;
    expect(other.kpis).toMatchObject({ activeOrders: 1, samplingStyles: 0, dueSoonOrders: 1, todos: { total: 0 } });
    expect(other.customerDistribution.map((c: { customerName: string }) => c.customerName)).toEqual(["极线"]);
    expect((await t.anon.get("/todos/overview")).status).toBe(401);
  });
});
