import { addDays } from "@otd/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Scheduler } from "../../core/scheduler.js";
import { type Caller, PHONES, type TestApp, createTestApp } from "../../testing/test-app.js";

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
async function makeOrder(customer = "MRN", styleNo = "11151") {
  const { customerOrders, orderLines, styles, factories, and, eq } = await db();
  const sid = (await t.db.select().from(styles).where(and(eq(styles.customerId, t.refs.customers[customer]!), eq(styles.styleNo, styleNo))))[0]!.id;
  const nh5 = (await t.db.select().from(factories).where(eq(factories.code, "NH5")))[0]!.id;
  const order = (
    await t.db
      .insert(customerOrders)
      .values({ poNo: `PO-S${String(++seq).padStart(4, "0")}`, currency: "EUR", customerDueDate: addDays(TODAY, 30), factoryId: nh5, totalPairs: 3000, status: "IN_PRODUCTION", transportMode: "OCEAN", destination: "Hamburg, DE", seasonCode: "HO26", ownerId: t.refs.users[PHONES.sales]!, orgId: t.refs.orgs.ORG003!, customerId: t.refs.customers[customer]! })
      .returning()
  )[0]!;
  for (const size of ["S", "M", "L"]) await t.db.insert(orderLines).values({ orderId: order.id, styleId: sid, color: "Black", size, quantity: 1000, unitPrice: 1.86 });
  return { order, styleId: sid };
}

async function release(orderId: string, styleId: string) {
  const { inspections, customerOrders, eq } = await db();
  const order = (await t.db.select().from(customerOrders).where(eq(customerOrders.id, orderId)))[0]!;
  const row = (
    await t.db
      .insert(inspections)
      .values({ docNo: `INSP-REL-${++seq}`, orderId, styleId, stage: "FRI", result: "PASS", status: "RELEASED", releasedAt: new Date(NOW), ownerId: order.ownerId, orgId: order.orgId, customerId: order.customerId })
      .returning()
  )[0]!;
  return row;
}

async function forwarder(code: string) {
  const { forwarders, eq } = await db();
  return (await t.db.select().from(forwarders).where(eq(forwarders.code, code)))[0]!.id;
}

async function newShipment(customs: Caller, orderId: string, styleId: string, extra: Record<string, unknown> = {}) {
  const booking = await customs.post("/bookings", { orderId, forwarderId: await forwarder("NFI"), carrier: "长荣海运", vessel: "EVER GIVEN", voyage: "026E", blNo: "EGLV026087011", transportMode: "OCEAN", etd: addDays(TODAY, 5), eta: addDays(TODAY, 30) });
  expect(booking.status).toBe(201);
  const created = await customs.post("/shipments", { orderId, bookingId: booking.body.data.id, styleId, pairs: 1200, cartonCount: 67, grossWeight: 30.7, ...extra });
  expect(created.status).toBe(201);
  return { booking: booking.body.data, shipment: created.body.data };
}

describe("shipments M11", () => {
  it("ships demo batches: PO0009412 signed / arrived / sailed, PO0009631 only booked", async () => {
    const customs = await t.as("customs");
    const bby = (await customs.get("/shipments?keyword=PO0009412")).body.data.items.map((s: { status: string }) => s.status).sort();
    expect(bby).toEqual(["ARRIVED", "SAILED", "SIGNED"]);
    const mrn = (await customs.get("/shipments?keyword=PO0009631")).body.data.items;
    expect(mrn.map((s: { status: string }) => s.status)).toEqual(["BOOKED"]);
    const signed = (await customs.get("/shipments?keyword=PO0009412&status=SIGNED")).body.data.items[0];
    const detail = (await customs.get(`/shipments/${signed.id}`)).body.data;
    expect(detail.receivable?.docNo).toMatch(/^AR-/);
    expect(detail.batches).toHaveLength(3);
    expect(detail.released).toBe(true);
  });

  it("books, ships through five nodes behind the G2 gate and signs", async () => {
    const customs = await t.as("customs");
    const sales = await t.as("sales");
    const { order, styleId } = await makeOrder();
    const { booking, shipment } = await newShipment(customs, order.id, styleId);
    expect(booking.docNo).toMatch(/^BK-2611-\d{3}$/);
    expect(booking.forwarderName).toBe("NFI 物流");
    expect(booking.status).toBe("PENDING_CARRIER");
    expect(shipment.docNo).toMatch(/^SH-2611-\d{3}$/);
    expect(shipment.status).toBe("BOOKED");
    expect(shipment.carrierText).toBe("NFI 物流 / 长荣海运");
    expect(shipment.blNo).toBe("EGLV026087011");
    expect(shipment.etd).toBe(addDays(TODAY, 5));
    expect(shipment.transportMode).toBe("OCEAN");

    expect((await sales.post(`/shipments/${shipment.id}/advance`, { version: shipment.version, to: "PACKED" })).status).toBe(403);
    const gated = await customs.post(`/shipments/${shipment.id}/advance`, { version: shipment.version, to: "PACKED" });
    expect(gated.status).toBe(409);
    expect(gated.body.errcode).toBe("FLOW_GATE_BLOCKED");
    expect(gated.body.errParams?.missingKeys).toEqual(["验货未放行"]);

    const insp = await release(order.id, styleId);
    const packed = await customs.post(`/shipments/${shipment.id}/advance`, { version: shipment.version, to: "PACKED" });
    expect(packed.status).toBe(200);
    expect(packed.body.data.status).toBe("PACKED");
    const skip = await customs.post(`/shipments/${shipment.id}/sign`, { version: packed.body.data.version });
    expect(skip.body.errcode).toBe("FLOW_ILLEGAL_TRANSITION");
    const stale = await customs.post(`/shipments/${shipment.id}/advance`, { version: shipment.version, to: "SAILED" });
    expect(stale.body.errcode).toBe("COMMON_VERSION_CONFLICT");
    const sailed = await customs.post(`/shipments/${shipment.id}/advance`, { version: packed.body.data.version, to: "SAILED", actualAt: "2026-11-20T08:00:00Z" });
    const arrived = await customs.post(`/shipments/${shipment.id}/advance`, { version: sailed.body.data.version, to: "ARRIVED", eta: addDays(TODAY, 28) });
    expect(arrived.body.data.status).toBe("ARRIVED");
    expect((await (await t.as("finance")).post(`/shipments/${shipment.id}/sign`, { version: arrived.body.data.version })).status).toBe(403);
    const signed = await customs.post(`/shipments/${shipment.id}/sign`, { version: arrived.body.data.version, signedAt: "2026-12-14T03:00:00Z" });
    expect(signed.status).toBe(200);
    expect(signed.body.data.status).toBe("SIGNED");
    expect(signed.body.data.signedAt).toBe("2026-12-14T03:00:00.000Z");

    const detail = (await sales.get(`/shipments/${shipment.id}`)).body.data;
    expect(detail.events.map((e: { status: string; actualAt: string | null }) => [e.status, !!e.actualAt])).toEqual([["BOOKED", true], ["PACKED", true], ["SAILED", true], ["ARRIVED", true], ["SIGNED", true]]);
    expect(detail.events[2].plannedAt).toBe(addDays(TODAY, 5));
    expect(detail.events[2].actualAt).toBe("2026-11-20T08:00:00.000Z");
    expect(detail.events[3].plannedAt).toBe(addDays(TODAY, 28));
    expect(detail.booking.docNo).toBe(booking.docNo);
    expect(detail.inspectionNo).toBe(insp.docNo);
    expect(detail.released).toBe(true);
    expect(detail.receivable?.docNo).toMatch(/^AR-202611-\d{3}$/);

    const { domainEvents, eq } = await db();
    const ev = (await t.db.select().from(domainEvents).where(eq(domainEvents.aggregateId, shipment.id))).find((e) => e.type === "shipment.shipment.signed")!;
    expect(ev.payload).toMatchObject({ orderId: order.id, pairs: 1200, signedDate: "2026-12-14" });
    expect(ev.processedAt).not.toBeNull();
  });

  it("lists batches of the same PO, propagates booking changes and keeps scope", async () => {
    const customs = await t.as("customs");
    const sales = await t.as("sales");
    const { order, styleId } = await makeOrder();
    const first = await newShipment(customs, order.id, styleId);
    const second = await customs.post("/shipments", { orderId: order.id, styleId, transportMode: "RAIL", pairs: 800, etd: addDays(TODAY, 12) });
    expect(second.body.data.destination).toBe("Hamburg, DE");

    const upd = await customs.put(`/bookings/${first.booking.id}`, { version: first.booking.version, etd: addDays(TODAY, 7), blNo: "EGLV026087999" });
    expect(upd.status).toBe(200);
    expect((await customs.put(`/bookings/${first.booking.id}`, { version: first.booking.version, vessel: "X" })).body.errcode).toBe("COMMON_VERSION_CONFLICT");
    const detail = (await sales.get(`/shipments/${first.shipment.id}`)).body.data;
    expect(detail.etd).toBe(addDays(TODAY, 7));
    expect(detail.blNo).toBe("EGLV026087999");
    expect(detail.events[2].plannedAt).toBe(addDays(TODAY, 7));
    expect(detail.batches.map((b: { docNo: string }) => b.docNo)).toEqual([first.shipment.docNo, second.body.data.docNo]);

    const bk = (await sales.get(`/bookings/${first.booking.id}`)).body.data;
    expect(bk.shipments.map((s: { id: string }) => s.id)).toEqual([first.shipment.id]);
    expect((await sales.post("/bookings", { orderId: order.id })).status).toBe(403);

    const other = await t.as("sales3");
    expect((await other.get(`/shipments/${first.shipment.id}`)).status).toBe(404);
    expect((await other.get(`/shipments?orderId=${order.id}`)).body.data.total).toBe(0);
    expect((await other.get(`/bookings/${first.booking.id}`)).status).toBe(404);
    expect((await (await t.as("finance")).get(`/shipments?orderId=${order.id}`)).body.data.total).toBe(2);
    expect((await (await t.as("manager")).get(`/shipments/${first.shipment.id}`)).status).toBe(200);

    const mismatch = await makeOrder();
    const bad = await customs.post("/shipments", { orderId: mismatch.order.id, bookingId: first.booking.id, pairs: 10 });
    expect(bad.body.errcode).toBe("SHIPMENT_BOOKING_ORDER_MISMATCH");

    const kpis = (await customs.get("/shipments/kpis")).body.data;
    expect(kpis.booked).toBeGreaterThanOrEqual(2);
    expect(kpis.unconfirmedBookings).toBeGreaterThanOrEqual(1);
    const filtered = (await customs.get(`/shipments?keyword=${order.poNo}`)).body.data;
    expect(filtered.total).toBe(2);
  });

  it("confirms and cancels bookings with status checks", async () => {
    const customs = await t.as("customs");
    const sales = await t.as("sales");
    const { order, styleId } = await makeOrder();
    const { booking, shipment } = await newShipment(customs, order.id, styleId);
    expect((await sales.post(`/bookings/${booking.id}/confirm`, { version: booking.version })).status).toBe(403);
    const pending = (await customs.get(`/bookings?orderId=${order.id}&status=PENDING_CARRIER`)).body.data;
    expect(pending.items.map((b: { id: string }) => b.id)).toEqual([booking.id]);
    const confirmed = await customs.post(`/bookings/${booking.id}/confirm`, { version: booking.version, vessel: "EVER ALOT", etd: addDays(TODAY, 9) });
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.data.status).toBe("CONFIRMED");
    expect(confirmed.body.data.confirmedAt).toBe("2026-11-15T01:00:00.000Z");
    expect((await customs.get(`/shipments/${shipment.id}`)).body.data.etd).toBe(addDays(TODAY, 9));
    const again = await customs.post(`/bookings/${booking.id}/confirm`, { version: confirmed.body.data.version });
    expect(again.body.errcode).toBe("FLOW_ILLEGAL_TRANSITION");

    await release(order.id, styleId);
    const ship = (await customs.get(`/shipments/${shipment.id}`)).body.data;
    await customs.post(`/shipments/${shipment.id}/advance`, { version: ship.version, to: "PACKED" });
    const inUse = await customs.post(`/bookings/${booking.id}/cancel`, { version: confirmed.body.data.version, reason: "改船期" });
    expect(inUse.body.errcode).toBe("SHIPMENT_BOOKING_IN_USE");

    const spare = (await customs.post("/bookings", { orderId: order.id, carrier: "中远海运", etd: addDays(TODAY, 20) })).body.data;
    const cancelled = await customs.post(`/bookings/${spare.id}/cancel`, { version: spare.version, reason: "客户改走铁路" });
    expect(cancelled.body.data.status).toBe("CANCELLED");
    expect(cancelled.body.data.cancelReason).toBe("客户改走铁路");
    const blocked = await customs.post("/shipments", { orderId: order.id, bookingId: spare.id, pairs: 10 });
    expect(blocked.body.errcode).toBe("SHIPMENT_BOOKING_CANCELLED");
    expect((await customs.put(`/bookings/${spare.id}`, { version: cancelled.body.data.version, vessel: "X" })).body.errcode).toBe("SHIPMENT_BOOKING_CANCELLED");
  });

  it("daily job raises customs todos for missed ETD and unsigned arrivals", async () => {
    const customs = await t.as("customs");
    const { order, styleId } = await makeOrder();
    await release(order.id, styleId);
    const late = (await customs.post("/shipments", { orderId: order.id, styleId, pairs: 100, etd: addDays(TODAY, -3) })).body.data;
    const arrivedShip = (await customs.post("/shipments", { orderId: order.id, styleId, pairs: 100, etd: addDays(TODAY, -30) })).body.data;
    let v = arrivedShip.version;
    for (const [to, at] of [["PACKED", "2026-10-10T00:00:00Z"], ["SAILED", "2026-10-16T00:00:00Z"], ["ARRIVED", "2026-11-01T00:00:00Z"]] as const) {
      v = (await customs.post(`/shipments/${arrivedShip.id}/advance`, { version: v, to, actualAt: at })).body.data.version;
    }
    const scheduler = t.app.get(Scheduler);
    await scheduler.runNow("shipment.daily");
    await scheduler.runNow("shipment.daily");
    const open = async () => {
      const board = (await customs.get("/todos/board")).body.data;
      return [...board.overdue, ...board.today, ...board.later].filter((i: { docId: string }) => i.docId === late.id || i.docId === arrivedShip.id).map((i: { action: string; docId: string }) => `${i.docId === late.id ? "late" : "arrived"}:${i.action}`).sort();
    };
    expect(await open()).toEqual(["arrived:shipment.podOverdue", "late:shipment.etdPassed"]);
    await customs.post(`/shipments/${arrivedShip.id}/sign`, { version: v });
    v = (await customs.post(`/shipments/${late.id}/advance`, { version: late.version, to: "PACKED" })).body.data.version;
    await customs.post(`/shipments/${late.id}/advance`, { version: v, to: "SAILED" });
    expect(await open()).toEqual([]);
  });
});
