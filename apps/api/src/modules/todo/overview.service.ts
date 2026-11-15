import { Inject, Injectable } from "@nestjs/common";
import type { BookingStatus } from "@otd/contracts/shipment";
import type { DueReminder, TodoOverview } from "@otd/contracts/todo";
import { type Database, bookings, customerOrders, customers, inspections, nodeStateSnapshots, patrolHits, sampleRounds, samples, shipments } from "@otd/db";
import { and, eq, inArray, lte, ne } from "drizzle-orm";
import type { AccessContext } from "../../core/access/access.types.js";
import { scoped } from "../../core/access/scope.js";
import { Clock } from "../../core/clock.js";
import { DB } from "../../core/tokens.js";
import { TodoService } from "./todo.service.js";

const ACTIVE = new Set(["PENDING_CONFIRM", "TO_SCHEDULE", "IN_PRODUCTION", "TO_SHIP"]);
const STATUS_ORDER = ["IN_PRODUCTION", "COMPLETED", "PENDING_CONFIRM", "TO_SCHEDULE", "TO_SHIP"];
const PENDING_CARRIER: BookingStatus = "PENDING_CARRIER";
const CANCELLED_BOOKING: BookingStatus = "CANCELLED";
const DEPARTED = ["SAILED", "ARRIVED", "SIGNED"];

const addDays = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

@Injectable()
export class TodoOverviewService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly clock: Clock,
    private readonly todos: TodoService,
  ) {}

  async overview(ctx: AccessContext): Promise<TodoOverview> {
    const db = this.db;
    const today = this.clock.today();
    const horizon = addDays(today, 30);
    const board = await this.todos.board(ctx);

    const orders = await db
      .select({ id: customerOrders.id, poNo: customerOrders.poNo, customerId: customerOrders.customerId, status: customerOrders.status, totalPairs: customerOrders.totalPairs, customerDueDate: customerOrders.customerDueDate, factoryReplyDate: customerOrders.factoryReplyDate, delayDays: customerOrders.delayDays })
      .from(customerOrders)
      .where(and(scoped(customerOrders, ctx), ne(customerOrders.status, "CANCELLED")));
    const active = orders.filter((o) => ACTIVE.has(o.status));
    const custIds = [...new Set(orders.map((o) => o.customerId))];
    const custNames = new Map((custIds.length ? await db.select({ id: customers.id, name: customers.name }).from(customers).where(inArray(customers.id, custIds)) : []).map((c) => [c.id, c.name]));

    const byCustomer = new Map<string, { orders: number; pairs: number }>();
    for (const o of active) {
      const cur = byCustomer.get(o.customerId) ?? { orders: 0, pairs: 0 };
      cur.orders += 1;
      cur.pairs += o.totalPairs;
      byCustomer.set(o.customerId, cur);
    }
    const customerDistribution = [...byCustomer.entries()]
      .map(([customerId, v]) => ({ customerId, customerName: custNames.get(customerId) ?? "", orders: v.orders, pairs: v.pairs, pairsWan: Math.round((v.pairs / 10_000) * 100) / 100 }))
      .sort((a, b) => b.pairs - a.pairs);
    const statusDistribution = STATUS_ORDER.map((status) => ({ status, count: orders.filter((o) => o.status === status).length }));

    const sampleRows = await db.select({ id: samples.id, styleId: samples.styleId }).from(samples).where(scoped(samples, ctx));
    const rounds = sampleRows.length ? await db.select({ sampleId: sampleRounds.sampleId, roundNo: sampleRounds.roundNo, status: sampleRounds.status }).from(sampleRounds).where(inArray(sampleRounds.sampleId, sampleRows.map((s) => s.id))) : [];
    const latest = new Map<string, { roundNo: number; status: string }>();
    for (const r of rounds) if ((latest.get(r.sampleId)?.roundNo ?? 0) < r.roundNo) latest.set(r.sampleId, r);
    const samplingStyles = new Set(sampleRows.filter((s) => latest.has(s.id) && latest.get(s.id)!.status !== "APPROVED").map((s) => s.styleId)).size;

    const activeIds = active.map((o) => o.id);
    const blocked = activeIds.length ? await db.selectDistinct({ id: nodeStateSnapshots.orderId }).from(nodeStateSnapshots).where(and(inArray(nodeStateSnapshots.orderId, activeIds), inArray(nodeStateSnapshots.state, ["BLOCKED"]))) : [];
    const redHits = activeIds.length ? await db.selectDistinct({ id: patrolHits.targetId }).from(patrolHits).where(and(inArray(patrolHits.targetId, activeIds), inArray(patrolHits.light, ["RED"]), ne(patrolHits.status, "CLOSED"))) : [];
    const risky = new Set([...blocked.map((b) => b.id), ...redHits.map((h) => h.id)]);
    const riskCount = active.filter((o) => risky.has(o.id) || o.customerDueDate < today || (o.delayDays ?? 0) > 0).length;

    const pendingBookings = (await db.select({ id: bookings.id }).from(bookings).where(and(scoped(bookings, ctx), eq(bookings.status, PENDING_CARRIER)))).length;

    const reminders: DueReminder[] = [];
    const nameOf = (id: string) => custNames.get(id) ?? null;
    for (const o of active) {
      if (o.customerDueDate <= horizon) reminders.push({ kind: "CUSTOMER_DUE", docType: "order", docId: o.id, docNo: o.poNo, customerName: nameOf(o.customerId), date: o.customerDueDate, daysLeft: daysBetween(today, o.customerDueDate), link: `/orders/${o.id}` });
      if (o.factoryReplyDate && o.factoryReplyDate <= horizon && (o.status === "TO_SCHEDULE" || o.status === "IN_PRODUCTION")) reminders.push({ kind: "FACTORY_DUE", docType: "order", docId: o.id, docNo: o.poNo, customerName: nameOf(o.customerId), date: o.factoryReplyDate, daysLeft: daysBetween(today, o.factoryReplyDate), link: `/orders/${o.id}` });
    }
    const bookingRows = await db.select({ id: bookings.id, docNo: bookings.docNo, etd: bookings.etd, customerId: bookings.customerId }).from(bookings).where(and(scoped(bookings, ctx), ne(bookings.status, CANCELLED_BOOKING), lte(bookings.etd, horizon)));
    const departed = new Set(bookingRows.length ? (await db.select({ id: shipments.bookingId }).from(shipments).where(and(inArray(shipments.bookingId, bookingRows.map((b) => b.id)), inArray(shipments.status, DEPARTED)))).map((r) => r.id) : []);
    for (const b of bookingRows) if (b.etd && !departed.has(b.id)) reminders.push({ kind: "ETD", docType: "booking", docId: b.id, docNo: b.docNo, customerName: custNames.get(b.customerId) ?? null, date: b.etd, daysLeft: daysBetween(today, b.etd), link: `/shipments/bookings/${b.id}` });
    const inspRows = await db.select({ id: inspections.id, docNo: inspections.docNo, plannedDate: inspections.plannedDate, customerId: inspections.customerId }).from(inspections).where(and(scoped(inspections, ctx), inArray(inspections.stage, ["FRI"]), inArray(inspections.status, ["TO_SCHEDULE", "SCHEDULED"]), lte(inspections.plannedDate, horizon)));
    for (const i of inspRows) if (i.plannedDate) reminders.push({ kind: "FINAL_INSPECTION", docType: "inspection", docId: i.id, docNo: i.docNo, customerName: custNames.get(i.customerId) ?? null, date: i.plannedDate, daysLeft: daysBetween(today, i.plannedDate), link: `/inspections/${i.id}` });
    reminders.sort((a, b) => a.daysLeft - b.daysLeft || a.docNo.localeCompare(b.docNo));

    return {
      greeting: { userName: ctx.userName, today, weekday: new Date(`${today}T00:00:00Z`).getUTCDay(), dataScope: ctx.dataScope.mode, allCustomers: ctx.customerScope.mode === "ALL" },
      kpis: {
        todos: { total: board.counts.total, byDocType: board.counts.byDocType },
        activeOrders: active.length,
        samplingStyles,
        dueSoonOrders: active.filter((o) => o.customerDueDate <= horizon).length,
      },
      customerDistribution,
      statusDistribution,
      focus: {
        pendingConfirmOrders: { count: active.filter((o) => o.status === "PENDING_CONFIRM").length, link: "/orders?status=PENDING_CONFIRM" },
        pendingBookings: { count: pendingBookings, link: `/shipments/bookings?status=${PENDING_CARRIER}` },
        toShipOrders: { count: active.filter((o) => o.status === "TO_SHIP").length, link: "/orders?status=TO_SHIP" },
        riskOrders: { count: riskCount, link: "/orders?risk=1" },
      },
      dueReminders: reminders.slice(0, 12),
    };
  }
}
