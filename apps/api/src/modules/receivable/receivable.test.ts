import { addDays } from "@otd/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Scheduler } from "../../core/scheduler.js";
import { type TestApp, PHONES, createTestApp } from "../../testing/test-app.js";
import { ReceivableService } from "./receivable.service.js";

const NOW = "2026-11-15T01:00:00Z";
const TODAY = "2026-11-15";

let t: TestApp;
beforeEach(async () => {
  t = await createTestApp({ now: NOW });
});
afterEach(async () => {
  await t.close();
});

async function db() {
  return { ...(await import("@otd/db")), ...(await import("drizzle-orm")) };
}

let seq = 0;
async function makeOrder(opts: { customer?: string; styleNo?: string; currency?: string; prices?: [string, number, number][] } = {}) {
  const { customerOrders, orderLines, styles, factories, inspections, and, eq } = await db();
  const customer = opts.customer ?? "MRN";
  const sid = (await t.db.select().from(styles).where(and(eq(styles.customerId, t.refs.customers[customer]!), eq(styles.styleNo, opts.styleNo ?? "11151"))))[0]!.id;
  const nh5 = (await t.db.select().from(factories).where(eq(factories.code, "NH5")))[0]!.id;
  const own = { ownerId: t.refs.users[PHONES.sales]!, orgId: t.refs.orgs.ORG003!, customerId: t.refs.customers[customer]! };
  const order = (await t.db.insert(customerOrders).values({ poNo: `PO-R${String(++seq).padStart(4, "0")}`, currency: opts.currency ?? "EUR", customerDueDate: addDays(TODAY, 30), factoryId: nh5, totalPairs: 4000, status: "TO_SHIP", ...own }).returning())[0]!;
  for (const [size, quantity, unitPrice] of opts.prices ?? [["S", 1000, 1.8], ["M", 1000, 1.9], ["L", 2000, 2.0]]) {
    await t.db.insert(orderLines).values({ orderId: order.id, styleId: sid, color: "Black", size, quantity, unitPrice });
  }
  await t.db.insert(inspections).values({ docNo: `INSP-AR-${++seq}`, orderId: order.id, styleId: sid, stage: "FRI", result: "PASS", status: "RELEASED", releasedAt: new Date(NOW), ...own });
  return { order, styleId: sid };
}

async function signedShipment(orderId: string, styleId: string, pairs: number, signedAt: string) {
  const customs = await t.as("customs");
  const created = (await customs.post("/shipments", { orderId, styleId, pairs })).body.data;
  let v = created.version;
  for (const to of ["PACKED", "SAILED", "ARRIVED"]) v = (await customs.post(`/shipments/${created.id}/advance`, { version: v, to })).body.data.version;
  const signed = await customs.post(`/shipments/${created.id}/sign`, { version: v, signedAt });
  expect(signed.status).toBe(200);
  return created;
}

async function goodsAr(shipmentId: string) {
  const { receivables, eq } = await db();
  return t.db.select().from(receivables).where(eq(receivables.shipmentId, shipmentId));
}

describe("receivables M12", () => {
  it("ships demo receivables across currencies with overdue, partial, offset and disputed items", async () => {
    const finance = await t.as("finance");
    const items = (await finance.get("/receivables?pageSize=200")).body.data.items as { currency: string; status: string; disputed: boolean; overdue: boolean }[];
    expect(items.length).toBeGreaterThanOrEqual(15);
    expect(new Set(items.map((i) => i.currency))).toEqual(new Set(["USD", "EUR", "JPY", "CNY"]));
    for (const st of ["NOT_DUE", "DUE", "PARTIAL", "PAID", "OFFSET_PENDING"]) expect(items.some((i) => i.status === st)).toBe(true);
    expect(items.some((i) => i.disputed && i.overdue)).toBe(true);
    const kpis = (await finance.get("/receivables/kpis")).body.data;
    expect(kpis.overdueCount).toBeGreaterThanOrEqual(5);
    expect(kpis.missingData).toBeGreaterThanOrEqual(2);
    const summary = (await finance.get("/receivables/collection/summary")).body.data;
    expect(summary.untouched).toBeGreaterThanOrEqual(1);
    expect(summary.todayFollowUps).toBeGreaterThanOrEqual(1);
    expect(summary.team.length).toBeGreaterThanOrEqual(2);
  });

  it("creates the goods receivable when a shipment is signed (amount, currency, due date)", async () => {
    const { order, styleId } = await makeOrder();
    const ship = await signedShipment(order.id, styleId, 1200, "2026-11-10T06:00:00Z");
    const rows = await goodsAr(ship.id);
    expect(rows).toHaveLength(1);
    const ar = rows[0]!;
    expect(ar.docNo).toMatch(/^AR-202611-\d{3}$/);
    expect(ar.type).toBe("GOODS");
    expect(ar.amount).toBe(2310);
    expect(ar.currency).toBe("EUR");
    expect(ar.dueDate).toBe("2027-01-09");
    expect(ar.status).toBe("NOT_DUE");
    expect(ar.settlementEntity).toBe("Morning Runner GmbH");
    expect(ar.ownerId).toBe(order.ownerId);
    expect(ar.sourceNo).toBe(ship.docNo);

    expect(await t.app.get(ReceivableService).createFromShipment(ship.id, "2026-11-10")).toBeNull();
    expect(await goodsAr(ship.id)).toHaveLength(1);

    const sales = await t.as("sales");
    const dto = (await sales.get(`/receivables/${ar.id}`)).body.data;
    expect(dto.poNo).toBe(order.poNo);
    expect(dto.shipmentNo).toBe(ship.docNo);
    expect(dto.outstanding).toBe(2310);
    const notes = (await sales.get("/notifications")).body.data.items;
    expect(notes.some((n: { title: string }) => n.title.startsWith(ar.docNo))).toBe(true);
  });

  it("records partial and full receipts with version, permission and scope checks", async () => {
    const finance = await t.as("finance");
    const sales = await t.as("sales");
    const { order, styleId } = await makeOrder();
    const ship = await signedShipment(order.id, styleId, 1000, "2026-11-12T06:00:00Z");
    const ar = (await goodsAr(ship.id))[0]!;
    expect((await sales.post(`/receivables/${ar.id}/receipts`, { version: ar.version, amount: 100, receivedAt: TODAY })).status).toBe(403);
    expect((await (await t.as("sales3")).get(`/receivables/${ar.id}`)).status).toBe(404);
    expect((await (await t.as("sales3")).get(`/receivables?orderId=${order.id}`)).body.data.total).toBe(0);

    const partial = await finance.post(`/receivables/${ar.id}/receipts`, { version: ar.version, amount: 1000, receivedAt: TODAY, bankRef: "HSBC-001" });
    expect(partial.status).toBe(200);
    expect(partial.body.data.status).toBe("PARTIAL");
    expect(partial.body.data.receivedAmount).toBe(1000);
    expect(partial.body.data.progress).toBeCloseTo(1000 / 1925, 3);

    expect((await finance.post(`/receivables/${ar.id}/receipts`, { version: ar.version, amount: 1, receivedAt: TODAY })).body.errcode).toBe("COMMON_VERSION_CONFLICT");
    expect((await finance.post(`/receivables/${ar.id}/receipts`, { version: partial.body.data.version, amount: 5000, receivedAt: TODAY })).body.errcode).toBe("RECEIVABLE_OVERPAID");
    expect((await finance.post(`/receivables/${ar.id}/receipts`, { version: partial.body.data.version, amount: 10, currency: "USD", receivedAt: TODAY })).body.errcode).toBe("RECEIVABLE_CURRENCY_MISMATCH");

    const second = await finance.post(`/receivables/${ar.id}/receipts`, { version: partial.body.data.version, amount: 500, receivedAt: TODAY });
    expect(second.body.data.status).toBe("PARTIAL");
    const paid = await finance.post(`/receivables/${ar.id}/receipts`, { version: second.body.data.version, amount: 425, receivedAt: TODAY });
    expect(paid.body.data.status).toBe("PAID");
    expect(paid.body.data.outstanding).toBe(0);
    const again = await finance.post(`/receivables/${ar.id}/receipts`, { version: paid.body.data.version, amount: 1, receivedAt: TODAY });
    expect(again.body.errcode).toBe("RECEIVABLE_OVERPAID");
    const detail = (await sales.get(`/receivables/${ar.id}`)).body.data;
    expect(detail.receipts.map((r: { amount: number }) => r.amount)).toEqual([1000, 500, 425]);
  });

  it("creates negative deductions pending offset and offsets them against a receivable", async () => {
    const finance = await t.as("finance");
    const { order, styleId } = await makeOrder();
    const ship = await signedShipment(order.id, styleId, 1000, "2026-11-12T06:00:00Z");
    const target = (await goodsAr(ship.id))[0]!;
    expect((await finance.post("/receivables", { orderId: order.id, type: "DEDUCTION", amount: 500 })).body.errcode).toBe("RECEIVABLE_AMOUNT_SIGN");
    expect((await finance.post("/receivables", { orderId: order.id, type: "FREIGHT", amount: -5 })).body.errcode).toBe("RECEIVABLE_AMOUNT_SIGN");
    expect((await (await t.as("sales")).post("/receivables", { orderId: order.id, type: "SAMPLE", amount: 50 })).status).toBe(403);

    const deduction = await finance.post("/receivables", { orderId: order.id, type: "DEDUCTION", amount: -500, dueDate: addDays(TODAY, 10), note: "质量扣款" });
    expect(deduction.status).toBe(201);
    expect(deduction.body.data.status).toBe("OFFSET_PENDING");
    expect(deduction.body.data.currency).toBe("EUR");
    expect(deduction.body.data.ownerId).toBe(order.ownerId);
    const d = deduction.body.data;
    expect((await finance.post(`/receivables/${d.id}/receipts`, { version: d.version, amount: 500, receivedAt: TODAY })).body.errcode).toBe("RECEIVABLE_NOT_OFFSET");

    const other = await makeOrder({ customer: "NSR", styleNo: "11506", currency: "EUR" });
    const otherShip = await signedShipment(other.order.id, other.styleId, 100, "2026-11-12T06:00:00Z");
    const otherAr = (await goodsAr(otherShip.id))[0]!;
    expect((await finance.post(`/receivables/${d.id}/offset`, { version: d.version, targetId: otherAr.id })).body.errcode).toBe("RECEIVABLE_OFFSET_TARGET_INVALID");

    const off = await finance.post(`/receivables/${d.id}/offset`, { version: d.version, targetId: target.id });
    expect(off.status).toBe(200);
    expect(off.body.data.status).toBe("OFFSET");
    const tgt = (await finance.get(`/receivables/${target.id}`)).body.data;
    expect(tgt.status).toBe("PARTIAL");
    expect(tgt.receivedAmount).toBe(500);
    expect(tgt.receipts[0].method).toBe("OFFSET");
    expect((await finance.post(`/receivables/${d.id}/offset`, { version: off.body.data.version, targetId: target.id })).body.errcode).toBe("FLOW_ILLEGAL_TRANSITION");
  });

  it("daily job moves due items, raises one overdue todo and notification, and collection logs close it", async () => {
    const finance = await t.as("finance");
    const sales = await t.as("sales");
    const { order } = await makeOrder();
    const soon = (await finance.post("/receivables", { orderId: order.id, type: "TESTING", amount: 320, dueDate: addDays(TODAY, 2) })).body.data;
    expect(soon.status).toBe("NOT_DUE");
    const { receivables, eq } = await db();
    await t.db.update(receivables).set({ dueDate: addDays(TODAY, -3) }).where(eq(receivables.id, soon.id));
    const scheduler = t.app.get(Scheduler);
    await scheduler.runNow("receivable.daily");
    await scheduler.runNow("receivable.daily");
    const after = (await sales.get(`/receivables/${soon.id}`)).body.data;
    expect(after.status).toBe("DUE");
    expect(after.overdue).toBe(true);
    expect(after.overdueDays).toBe(3);

    const todosFor = async (id: string) => {
      const board = (await sales.get("/todos/board")).body.data;
      return [...board.overdue, ...board.today, ...board.later].filter((i: { docId: string }) => i.docId === id).map((i: { action: string }) => i.action);
    };
    expect(await todosFor(soon.id)).toEqual(["receivable.overdue"]);
    const notes = (await sales.get("/notifications")).body.data.items.filter((n: { title: string }) => n.title.startsWith(soon.docNo));
    expect(notes).toHaveLength(1);

    const summaryBefore = (await sales.get("/receivables/collection/summary")).body.data;
    const logged = await sales.post(`/receivables/${soon.id}/collections`, { channel: "EMAIL", result: "DISPUTED", nextFollowUp: TODAY, note: "客户质疑检测费" });
    expect(logged.status).toBe(200);
    expect(logged.body.data.disputed).toBe(true);
    expect(logged.body.data.collectionCount).toBe(1);
    expect(logged.body.data.lastCollection).toMatchObject({ channel: "EMAIL", result: "DISPUTED" });
    expect(await todosFor(soon.id)).toEqual(["receivable.followUp"]);
    const summaryAfter = (await sales.get("/receivables/collection/summary")).body.data;
    expect(summaryAfter.untouched).toBe(summaryBefore.untouched - 1);
    expect(summaryAfter.todayFollowUps).toBe(summaryBefore.todayFollowUps + 1);
    const today = (await sales.get("/receivables/collection?tab=today&pageSize=200")).body.data.items;
    expect(today.some((r: { id: string }) => r.id === soon.id)).toBe(true);
    const mine = (await sales.get("/receivables/collection?tab=mine&pageSize=200")).body.data.items;
    expect(mine.some((r: { id: string }) => r.id === soon.id)).toBe(true);
    expect((await (await t.as("customs")).get("/receivables/collection")).status).toBe(403);

    await finance.post(`/receivables/${soon.id}/receipts`, { version: logged.body.data.version, amount: 320, receivedAt: TODAY });
    expect(await todosFor(soon.id)).toEqual([]);
  });

  it("converts KPIs to USD with exchange rates", async () => {
    const finance = await t.as("finance");
    const { order } = await makeOrder();
    const jp = await makeOrder({ customer: "NSR", styleNo: "11506", currency: "JPY" });
    const before = (await finance.get("/receivables/kpis")).body.data;
    await finance.post("/receivables", { orderId: order.id, type: "FREIGHT", amount: 1000, dueDate: addDays(TODAY, -3) });
    await finance.post("/receivables", { orderId: jp.order.id, type: "SAMPLE", amount: 150000, dueDate: "2026-11-28" });
    await finance.post("/receivables", { orderId: order.id, type: "TRIMS", amount: 80 });
    const after = (await finance.get("/receivables/kpis")).body.data;
    expect(after.balanceUsd - before.balanceUsd).toBeCloseTo((1000 * 7.75) / 7.1 + (150000 * 0.048) / 7.1 + (80 * 7.75) / 7.1, 1);
    expect(after.overdueUsd - before.overdueUsd).toBeCloseTo((1000 * 7.75) / 7.1, 1);
    expect(after.overdueCount - before.overdueCount).toBe(1);
    expect(after.dueThisMonth - before.dueThisMonth).toBe(2);
    expect(after.missingData - before.missingData).toBe(1);
    const filtered = (await finance.get(`/receivables/kpis?customerId=${t.refs.customers.NSR}&keyword=${jp.order.poNo}`)).body.data;
    expect(filtered.balanceUsd).toBeCloseTo((150000 * 0.048) / 7.1, 1);
  });

  it("registers invoices, recalculates due dates and rejects duplicates", async () => {
    const finance = await t.as("finance");
    const { order, styleId } = await makeOrder();
    const ship = await signedShipment(order.id, styleId, 1000, "2026-11-12T06:00:00Z");
    const ar = (await goodsAr(ship.id))[0]!;
    const inv = await finance.post("/receivables/invoices", { invoiceNo: "INV-26-0001", shipmentId: ship.id, amount: 1925, issuedDate: "2026-11-14" });
    expect(inv.status).toBe(201);
    expect(inv.body.data.receivableNo).toBe(ar.docNo);
    const updated = (await finance.get(`/receivables/${ar.id}`)).body.data;
    expect(updated.invoiceNo).toBe("INV-26-0001");
    expect(updated.dueDate).toBe("2027-01-13");
    expect((await finance.post("/receivables/invoices", { invoiceNo: "INV-26-0001", shipmentId: ship.id, amount: 1, issuedDate: TODAY })).body.errcode).toBe("COMMON_DUPLICATE");
    expect((await (await t.as("sales")).post("/receivables/invoices", { invoiceNo: "INV-X", shipmentId: ship.id, amount: 1, issuedDate: TODAY })).status).toBe(403);
    const list = (await (await t.as("sales")).get(`/receivables/invoices?orderId=${order.id}`)).body.data;
    expect(list.items.map((i: { invoiceNo: string }) => i.invoiceNo)).toEqual(["INV-26-0001"]);
  });
});
