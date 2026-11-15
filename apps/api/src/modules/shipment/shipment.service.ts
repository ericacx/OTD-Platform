import { Inject, Injectable, type OnModuleInit } from "@nestjs/common";
import type { Page } from "@otd/contracts/common";
import {
  type BookingDetailDto,
  type BookingDto,
  type BookingStatus,
  type bookingCancelSchema,
  type bookingConfirmSchema,
  type ShipmentDetailDto,
  type ShipmentDto,
  type ShipmentEventDto,
  type ShipmentKpiDto,
  type ShipmentStatus,
  type bookingCreateSchema,
  type bookingListQuerySchema,
  type bookingUpdateSchema,
  type shipmentAdvanceSchema,
  type shipmentCreateSchema,
  type shipmentListQuerySchema,
  type shipmentSignSchema,
  BOOKING_TRANSITIONS,
  SHIPMENT_STATUSES,
  shipmentErrors,
} from "@otd/contracts/shipment";
import {
  type Database,
  type DbOrTx,
  bookings,
  cartons,
  customerOrders,
  customers,
  factories,
  forwarders,
  inspections,
  orderLines,
  receivables,
  roles,
  shipmentEvents,
  shipments,
  styles,
  userRoles,
  users,
} from "@otd/db";
import { addDays, canTransition } from "@otd/shared";
import { type SQL, and, asc, desc, eq, ilike, inArray, isNotNull, lt, ne, or } from "drizzle-orm";
import type { z } from "zod";
import { type AccessContext, systemContext } from "../../core/access/access.types.js";
import { assertCanSee, scoped } from "../../core/access/scope.js";
import { AuditService } from "../../core/audit.service.js";
import { Clock } from "../../core/clock.js";
import { AppError, assertFound, gateBlocked, illegalTransition, versionConflict } from "../../core/errors.js";
import { EventBus, inTransaction } from "../../core/events.js";
import { NumberingService } from "../../core/numbering.service.js";
import { countAll, iso, likeKeyword, orderBy, paginate } from "../../core/paging.js";
import { Scheduler } from "../../core/scheduler.js";
import { DB } from "../../core/tokens.js";
import { TodoService } from "../todo/todo.service.js";

type ShipmentRow = typeof shipments.$inferSelect;
type BookingRow = typeof bookings.$inferSelect;
type OrderRow = typeof customerOrders.$inferSelect;

const GATED: ShipmentStatus[] = ["PACKED", "SAILED", "ARRIVED", "SIGNED"];
const ARRIVAL_GRACE_DAYS = 7;
const dueAt = (date: string) => new Date(`${date}T10:00:00.000Z`);

@Injectable()
export class ShipmentService implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly audit: AuditService,
    private readonly numbering: NumberingService,
    private readonly events: EventBus,
    private readonly clock: Clock,
    private readonly todos: TodoService,
    private readonly scheduler: Scheduler,
  ) {}

  onModuleInit(): void {
    this.scheduler.register({ name: "shipment.daily", dailyAt: "01:20", run: () => this.runDaily() });
  }

  private visible(ctx: AccessContext): SQL {
    return scoped(shipments, ctx);
  }

  private visibleBookings(ctx: AccessContext): SQL {
    return scoped(bookings, ctx);
  }

  private async loadShipment(ctx: AccessContext, id: string, db: DbOrTx = this.db): Promise<ShipmentRow> {
    return assertCanSee(ctx, (await db.select().from(shipments).where(eq(shipments.id, id)))[0]);
  }

  private async loadBooking(ctx: AccessContext, id: string, db: DbOrTx = this.db): Promise<BookingRow> {
    return assertCanSee(ctx, (await db.select().from(bookings).where(eq(bookings.id, id)))[0]);
  }

  private async loadOrder(ctx: AccessContext, id: string, db: DbOrTx): Promise<OrderRow> {
    return assertCanSee(ctx, (await db.select().from(customerOrders).where(eq(customerOrders.id, id)))[0]);
  }

  async listBookings(ctx: AccessContext, q: z.infer<typeof bookingListQuerySchema>): Promise<Page<BookingDto>> {
    const conds: SQL[] = [this.visibleBookings(ctx)];
    if (q.customerId) conds.push(eq(bookings.customerId, q.customerId));
    if (q.orderId) conds.push(eq(bookings.orderId, q.orderId));
    if (q.status?.length) conds.push(inArray(bookings.status, q.status));
    const kw = likeKeyword(q.keyword);
    if (kw) {
      const orderIds = (await this.db.select({ id: customerOrders.id }).from(customerOrders).where(ilike(customerOrders.poNo, kw))).map((o) => o.id);
      const parts: SQL[] = [ilike(bookings.docNo, kw), ilike(bookings.blNo, kw), ilike(bookings.vessel, kw), ilike(bookings.carrier, kw)];
      if (orderIds.length) parts.push(inArray(bookings.orderId, orderIds));
      conds.push(or(...parts)!);
    }
    const where = and(...conds);
    const sort = orderBy(q.sort, { docNo: bookings.docNo, etd: bookings.etd, createdAt: bookings.createdAt }, [desc(bookings.createdAt)]);
    return paginate(
      q,
      async () => (await this.db.select({ n: countAll }).from(bookings).where(where))[0]!.n,
      async (limit, offset) => this.toBookingDtos(await this.db.select().from(bookings).where(where).orderBy(...sort).limit(limit).offset(offset)),
    );
  }

  async getBooking(ctx: AccessContext, id: string): Promise<BookingDetailDto> {
    const row = await this.loadBooking(ctx, id);
    const dto = (await this.toBookingDtos([row]))[0]!;
    const list = await this.db.select().from(shipments).where(and(this.visible(ctx), eq(shipments.bookingId, id))).orderBy(asc(shipments.createdAt));
    return { ...dto, shipments: await this.toDtos(list) };
  }

  async createBooking(ctx: AccessContext, input: z.infer<typeof bookingCreateSchema>): Promise<BookingDto> {
    const row = await inTransaction(this.db, this.events, async (tx, emit) => {
      const order = await this.loadOrder(ctx, input.orderId, tx);
      if (input.forwarderId) assertFound((await tx.select({ id: forwarders.id }).from(forwarders).where(eq(forwarders.id, input.forwarderId)))[0]);
      const docNo = await this.numbering.next("booking", tx);
      const { orderId: _o, ...fields } = input;
      const created = (
        await tx
          .insert(bookings)
          .values({ ...fields, transportMode: input.transportMode ?? order.transportMode, docNo, orderId: order.id, status: "PENDING_CARRIER", ownerId: order.ownerId, orgId: order.orgId, customerId: order.customerId, createdBy: ctx.userId })
          .returning()
      )[0]!;
      await this.audit.log(ctx, { action: "shipment.booking.create", objectType: "booking", objectId: created.id, docNo }, tx);
      emit({ type: "shipment.booking.created", aggregateType: "booking", aggregateId: created.id, payload: { docNo, orderId: order.id, etd: created.etd } });
      return created;
    });
    return (await this.toBookingDtos([row]))[0]!;
  }

  async updateBooking(ctx: AccessContext, id: string, input: z.infer<typeof bookingUpdateSchema>): Promise<BookingDto> {
    const row = await inTransaction(this.db, this.events, async (tx) => {
      const before = await this.loadBooking(ctx, id, tx);
      if (before.version !== input.version) throw versionConflict();
      if (input.forwarderId) assertFound((await tx.select({ id: forwarders.id }).from(forwarders).where(eq(forwarders.id, input.forwarderId)))[0]);
      const { version, ...fields } = input;
      if (before.status === "CANCELLED") throw new AppError(shipmentErrors.SHIPMENT_BOOKING_CANCELLED, { docNo: before.docNo });
      const updated = (await tx.update(bookings).set({ ...fields, version: version + 1, updatedBy: ctx.userId }).where(and(eq(bookings.id, id), eq(bookings.version, version))).returning())[0];
      if (!updated) throw versionConflict();
      await this.syncShipments(tx, updated);
      const diff: Record<string, { from: unknown; to: unknown }> = {};
      for (const key of Object.keys(fields) as (keyof typeof fields)[]) {
        if (JSON.stringify(before[key] ?? null) !== JSON.stringify(updated[key] ?? null)) diff[key] = { from: before[key] ?? null, to: updated[key] ?? null };
      }
      await this.audit.log(ctx, { action: "shipment.booking.update", objectType: "booking", objectId: id, docNo: before.docNo, diff }, tx);
      return updated;
    });
    return (await this.toBookingDtos([row]))[0]!;
  }

  async confirmBooking(ctx: AccessContext, id: string, input: z.infer<typeof bookingConfirmSchema>): Promise<BookingDto> {
    const { version, note, ...fields } = input;
    const patch: Partial<BookingRow> = { confirmedAt: this.clock.now() };
    for (const [k, v] of Object.entries(fields)) if (v !== undefined) Object.assign(patch, { [k]: v });
    if (note !== undefined) patch.note = note;
    return this.moveBooking(ctx, id, version, "CONFIRMED", patch, null);
  }

  async cancelBooking(ctx: AccessContext, id: string, input: z.infer<typeof bookingCancelSchema>): Promise<BookingDto> {
    return this.moveBooking(ctx, id, input.version, "CANCELLED", { cancelReason: input.reason }, input.reason);
  }

  private async moveBooking(ctx: AccessContext, id: string, version: number, to: BookingStatus, patch: Partial<BookingRow>, note: string | null): Promise<BookingDto> {
    const row = await inTransaction(this.db, this.events, async (tx, emit) => {
      const before = await this.loadBooking(ctx, id, tx);
      if (before.version !== version) throw versionConflict();
      if (!(BOOKING_TRANSITIONS[before.status as BookingStatus] ?? []).includes(to)) throw illegalTransition(before.status, to === "CONFIRMED" ? "confirm" : "cancel");
      if (to === "CANCELLED") {
        const used = await tx.select({ id: shipments.id }).from(shipments).where(and(eq(shipments.bookingId, id), ne(shipments.status, "BOOKED")));
        if (used.length) throw new AppError(shipmentErrors.SHIPMENT_BOOKING_IN_USE);
      }
      const updated = (await tx.update(bookings).set({ ...patch, status: to, version: version + 1, updatedBy: ctx.userId }).where(and(eq(bookings.id, id), eq(bookings.version, version))).returning())[0];
      if (!updated) throw versionConflict();
      if (to === "CONFIRMED") await this.syncShipments(tx, updated);
      if (to === "CANCELLED") await tx.update(shipments).set({ bookingId: null }).where(eq(shipments.bookingId, id));
      const action = to === "CONFIRMED" ? "confirm" : "cancel";
      await this.audit.log(ctx, { action: `shipment.booking.${action}`, objectType: "booking", objectId: id, docNo: before.docNo, diff: { status: { from: before.status, to }, ...(note ? { reason: { from: null, to: note } } : {}) } }, tx);
      emit({ type: `shipment.booking.${to === "CONFIRMED" ? "confirmed" : "cancelled"}`, aggregateType: "booking", aggregateId: id, payload: { docNo: before.docNo, orderId: before.orderId, etd: updated.etd } });
      return updated;
    });
    return (await this.toBookingDtos([row]))[0]!;
  }

  private async syncShipments(tx: DbOrTx, booking: BookingRow): Promise<void> {
    const pending = await tx.select().from(shipments).where(and(eq(shipments.bookingId, booking.id), inArray(shipments.status, ["BOOKED", "PACKED"])));
    const carrier = await this.carrierText(tx, booking);
    for (const s of pending) {
      await tx.update(shipments).set({ blNo: booking.blNo ?? s.blNo, etd: booking.etd ?? s.etd, eta: booking.eta ?? s.eta, carrierText: carrier ?? s.carrierText, version: s.version + 1 }).where(eq(shipments.id, s.id));
      if (booking.etd) await tx.update(shipmentEvents).set({ plannedAt: booking.etd }).where(and(eq(shipmentEvents.shipmentId, s.id), eq(shipmentEvents.status, "SAILED")));
      if (booking.eta) await tx.update(shipmentEvents).set({ plannedAt: booking.eta }).where(and(eq(shipmentEvents.shipmentId, s.id), eq(shipmentEvents.status, "ARRIVED")));
    }
  }

  async list(ctx: AccessContext, q: z.infer<typeof shipmentListQuerySchema>): Promise<Page<ShipmentDto>> {
    const conds: SQL[] = [this.visible(ctx)];
    if (q.status?.length) conds.push(inArray(shipments.status, q.status));
    if (q.arrivedNotSigned) conds.push(eq(shipments.status, "ARRIVED"));
    if (q.customerId) conds.push(eq(shipments.customerId, q.customerId));
    if (q.orderId) conds.push(eq(shipments.orderId, q.orderId));
    if (q.transportMode?.length) conds.push(inArray(shipments.transportMode, q.transportMode));
    const kw = likeKeyword(q.keyword);
    if (kw) {
      const orderIds = (await this.db.select({ id: customerOrders.id }).from(customerOrders).where(ilike(customerOrders.poNo, kw))).map((o) => o.id);
      const styleIds = (await this.db.select({ id: styles.id }).from(styles).where(or(ilike(styles.styleNo, kw), ilike(styles.nameZh, kw)))).map((s) => s.id);
      const parts: SQL[] = [ilike(shipments.docNo, kw), ilike(shipments.blNo, kw), ilike(shipments.destination, kw)];
      if (orderIds.length) parts.push(inArray(shipments.orderId, orderIds));
      if (styleIds.length) parts.push(inArray(shipments.styleId, styleIds));
      conds.push(or(...parts)!);
    }
    const where = and(...conds);
    const sort = orderBy(q.sort, { docNo: shipments.docNo, etd: shipments.etd, eta: shipments.eta, createdAt: shipments.createdAt }, [desc(shipments.createdAt)]);
    return paginate(
      q,
      async () => (await this.db.select({ n: countAll }).from(shipments).where(where))[0]!.n,
      async (limit, offset) => this.toDtos(await this.db.select().from(shipments).where(where).orderBy(...sort).limit(limit).offset(offset)),
    );
  }

  async kpis(ctx: AccessContext): Promise<ShipmentKpiDto> {
    const rows = await this.db.select({ status: shipments.status, etd: shipments.etd, cartonCount: shipments.cartonCount }).from(shipments).where(this.visible(ctx));
    const month = this.clock.today().slice(0, 7);
    const count = (s: ShipmentStatus) => rows.filter((r) => r.status === s).length;
    const bookingRows = await this.db.select({ id: bookings.id }).from(bookings).where(and(this.visibleBookings(ctx), eq(bookings.status, "PENDING_CARRIER")));
    return {
      booked: count("BOOKED"),
      packed: count("PACKED"),
      inTransit: count("SAILED"),
      arrived: count("ARRIVED"),
      signed: count("SIGNED"),
      cartonsThisMonth: rows.filter((r) => r.status !== "BOOKED" && r.etd?.startsWith(month)).reduce((s, r) => s + (r.cartonCount ?? 0), 0),
      unconfirmedBookings: bookingRows.length,
    };
  }

  async get(ctx: AccessContext, id: string): Promise<ShipmentDetailDto> {
    const row = await this.loadShipment(ctx, id);
    const dto = (await this.toDtos([row]))[0]!;
    const eventRows = await this.db.select().from(shipmentEvents).where(eq(shipmentEvents.shipmentId, id));
    const events: ShipmentEventDto[] = SHIPMENT_STATUSES.map((status) => {
      const e = eventRows.find((x) => x.status === status);
      return { status, plannedAt: e?.plannedAt ?? null, actualAt: iso(e?.actualAt), note: e?.note ?? null };
    });
    const batchRows = await this.db.select().from(shipments).where(and(this.visible(ctx), eq(shipments.orderId, row.orderId))).orderBy(asc(shipments.createdAt));
    const bookingRow = row.bookingId ? (await this.db.select().from(bookings).where(eq(bookings.id, row.bookingId)))[0] : undefined;
    const boxes = await this.db.select({ id: cartons.id }).from(cartons).where(row.styleId ? and(eq(cartons.orderId, row.orderId), eq(cartons.styleId, row.styleId)) : eq(cartons.orderId, row.orderId));
    const ar = (await this.db.select({ id: receivables.id, docNo: receivables.docNo, status: receivables.status }).from(receivables).where(and(eq(receivables.shipmentId, id), eq(receivables.type, "GOODS"))))[0];
    return {
      ...dto,
      events,
      batches: await this.toDtos(batchRows),
      booking: bookingRow ? ((await this.toBookingDtos([bookingRow]))[0] ?? null) : null,
      released: !!(await this.releasedInspection(row.orderId, row.styleId)),
      cartonLines: boxes.length,
      receivable: ar ?? null,
    };
  }

  async create(ctx: AccessContext, input: z.infer<typeof shipmentCreateSchema>): Promise<ShipmentDto> {
    const row = await inTransaction(this.db, this.events, async (tx, emit) => {
      const order = await this.loadOrder(ctx, input.orderId, tx);
      const booking = input.bookingId ? assertFound((await tx.select().from(bookings).where(eq(bookings.id, input.bookingId)))[0]) : undefined;
      if (booking && booking.orderId !== order.id) throw new AppError(shipmentErrors.SHIPMENT_BOOKING_ORDER_MISMATCH);
      if (booking?.status === "CANCELLED") throw new AppError(shipmentErrors.SHIPMENT_BOOKING_CANCELLED, { docNo: booking.docNo });
      const styleId = input.styleId ?? null;
      if (styleId) {
        const line = (await tx.select({ id: orderLines.id }).from(orderLines).where(and(eq(orderLines.orderId, order.id), eq(orderLines.styleId, styleId))))[0];
        if (!line) throw new AppError(shipmentErrors.SHIPMENT_STYLE_NOT_IN_ORDER);
      }
      let inspectionId = input.inspectionId ?? null;
      if (!inspectionId) {
        const conds: SQL[] = [eq(inspections.orderId, order.id), eq(inspections.status, "RELEASED")];
        if (styleId) conds.push(eq(inspections.styleId, styleId));
        inspectionId = (await tx.select({ id: inspections.id }).from(inspections).where(and(...conds)).orderBy(desc(inspections.releasedAt)))[0]?.id ?? null;
      }
      let cartonCount = input.cartonCount ?? null;
      if (cartonCount === null) {
        const boxes = await tx.select({ n: cartons.cartonCount }).from(cartons).where(styleId ? and(eq(cartons.orderId, order.id), eq(cartons.styleId, styleId)) : eq(cartons.orderId, order.id));
        cartonCount = boxes.length ? boxes.reduce((s, b) => s + b.n, 0) : null;
      }
      const etd = input.etd ?? booking?.etd ?? null;
      const eta = input.eta ?? booking?.eta ?? null;
      const docNo = await this.numbering.next("shipment", tx);
      const created = (
        await tx
          .insert(shipments)
          .values({
            docNo,
            orderId: order.id,
            bookingId: booking?.id ?? null,
            styleId,
            transportMode: input.transportMode ?? booking?.transportMode ?? order.transportMode,
            destination: input.destination ?? order.destination,
            carrierText: input.carrierText ?? (booking ? await this.carrierText(tx, booking) : null),
            blNo: input.blNo ?? booking?.blNo ?? null,
            etd,
            eta,
            cartonCount,
            pairs: input.pairs,
            grossWeight: input.grossWeight ?? null,
            volume: input.volume ?? null,
            factoryId: order.factoryId,
            seasonCode: order.seasonCode,
            inspectionId,
            status: "BOOKED",
            note: input.note ?? null,
            ownerId: order.ownerId,
            orgId: order.orgId,
            customerId: order.customerId,
            createdBy: ctx.userId,
          })
          .returning()
      )[0]!;
      await tx.insert(shipmentEvents).values(
        SHIPMENT_STATUSES.map((status) => ({
          shipmentId: created.id,
          status,
          plannedAt: status === "SAILED" ? etd : status === "ARRIVED" ? eta : null,
          actualAt: status === "BOOKED" ? this.clock.now() : null,
          note: status === "BOOKED" && booking ? booking.docNo : null,
          operatorId: status === "BOOKED" ? ctx.userId : null,
        })),
      );
      await this.audit.log(ctx, { action: "shipment.shipment.create", objectType: "shipment", objectId: created.id, docNo }, tx);
      emit({ type: "shipment.shipment.created", aggregateType: "shipment", aggregateId: created.id, payload: { docNo, orderId: order.id } });
      return created;
    });
    return (await this.toDtos([row]))[0]!;
  }

  async advance(ctx: AccessContext, id: string, input: z.infer<typeof shipmentAdvanceSchema>): Promise<ShipmentDto> {
    const extra: Partial<ShipmentRow> = {};
    if (input.blNo) extra.blNo = input.blNo;
    if (input.eta) extra.eta = input.eta;
    return this.move(ctx, id, input.version, input.to, input.actualAt, input.note ?? null, extra);
  }

  async sign(ctx: AccessContext, id: string, input: z.infer<typeof shipmentSignSchema>): Promise<ShipmentDto> {
    const signedAt = input.signedAt ? new Date(input.signedAt) : this.clock.now();
    return this.move(ctx, id, input.version, "SIGNED", input.signedAt, input.note ?? null, { signedAt });
  }

  private async move(ctx: AccessContext, id: string, version: number, to: ShipmentStatus, actualAt: string | undefined, note: string | null, patch: Partial<ShipmentRow>): Promise<ShipmentDto> {
    let extra = patch;
    const row = await inTransaction(this.db, this.events, async (tx, emit) => {
      const before = await this.loadShipment(ctx, id, tx);
      if (before.version !== version) throw versionConflict();
      if (!canTransition("shipment", before.status as ShipmentStatus, to)) throw illegalTransition(before.status, to === "SIGNED" ? "sign" : to.toLowerCase());
      if (GATED.includes(to)) {
        const releasedId = await this.releasedInspection(before.orderId, before.styleId, tx);
        if (!releasedId) throw gateBlocked("G2", ["验货未放行"]);
        if (!before.inspectionId) extra = { ...extra, inspectionId: releasedId };
      }
      const at = actualAt ? new Date(actualAt) : this.clock.now();
      const updated = (
        await tx
          .update(shipments)
          .set({ ...extra, status: to, version: before.version + 1, updatedBy: ctx.userId })
          .where(and(eq(shipments.id, id), eq(shipments.version, version)))
          .returning()
      )[0];
      if (!updated) throw versionConflict();
      await tx.update(shipmentEvents).set({ actualAt: at, note, operatorId: ctx.userId }).where(and(eq(shipmentEvents.shipmentId, id), eq(shipmentEvents.status, to)));
      if (to === "ARRIVED" && extra.eta) await tx.update(shipmentEvents).set({ plannedAt: extra.eta }).where(and(eq(shipmentEvents.shipmentId, id), eq(shipmentEvents.status, "ARRIVED")));
      const action = to === "SIGNED" ? "sign" : "advance";
      await this.audit.log(ctx, { action: `shipment.shipment.${action}`, objectType: "shipment", objectId: id, docNo: before.docNo, diff: { status: { from: before.status, to } } }, tx);
      if (to === "SAILED") await this.todos.closeByPrefix(`shipment:etd:${id}`, tx);
      if (to === "SIGNED") await this.todos.closeForDoc("shipment", id, tx);
      if (to === "SIGNED") {
        emit({ type: "shipment.shipment.signed", aggregateType: "shipment", aggregateId: id, payload: { docNo: before.docNo, orderId: before.orderId, shipmentId: id, styleId: before.styleId, pairs: before.pairs ?? 0, signedDate: at.toISOString().slice(0, 10) } });
      } else {
        emit({ type: "shipment.shipment.advanced", aggregateType: "shipment", aggregateId: id, payload: { docNo: before.docNo, orderId: before.orderId, from: before.status, to } });
      }
      return updated;
    });
    return (await this.toDtos([row]))[0]!;
  }

  async runDaily(): Promise<{ etdPassed: number; arrivedUnsigned: number }> {
    const today = this.clock.today();
    return this.db.transaction(async (tx) => {
      const customs = await this.usersWithRole(tx, "R008");
      const late = await tx.select().from(shipments).where(and(inArray(shipments.status, ["BOOKED", "PACKED"]), isNotNull(shipments.etd), lt(shipments.etd, today)));
      for (const s of late) {
        for (const userId of customs) {
          await this.todos.upsert({ fingerprint: `shipment:etd:${s.id}:${userId}`, source: "FLOW", action: "shipment.etdPassed", title: `船期已过未开船 ${s.docNo}`, description: `ETD ${s.etd}`, docType: "shipment", docId: s.id, docNo: s.docNo, link: `/shipments/${s.id}`, customerId: s.customerId, assigneeId: userId, dueAt: dueAt(today) }, tx);
        }
      }
      const cutoff = new Date(`${addDays(today, -ARRIVAL_GRACE_DAYS)}T00:00:00.000Z`);
      const arrivedRows = await tx
        .select({ s: shipments, arrivedAt: shipmentEvents.actualAt })
        .from(shipments)
        .innerJoin(shipmentEvents, and(eq(shipmentEvents.shipmentId, shipments.id), eq(shipmentEvents.status, "ARRIVED")))
        .where(and(eq(shipments.status, "ARRIVED"), isNotNull(shipmentEvents.actualAt), lt(shipmentEvents.actualAt, cutoff)));
      for (const { s, arrivedAt } of arrivedRows) {
        for (const userId of customs) {
          await this.todos.upsert({ fingerprint: `shipment:pod:${s.id}:${userId}`, source: "FLOW", action: "shipment.podOverdue", title: `到港超 ${ARRIVAL_GRACE_DAYS} 天未签收 ${s.docNo}`, description: `到港 ${arrivedAt!.toISOString().slice(0, 10)} · ${s.destination ?? ""}`, docType: "shipment", docId: s.id, docNo: s.docNo, link: `/shipments/${s.id}`, customerId: s.customerId, assigneeId: userId, dueAt: dueAt(today) }, tx);
        }
      }
      if (late.length || arrivedRows.length) await this.audit.log(systemContext(), { action: "shipment.daily", diff: { etdPassed: late.length, arrivedUnsigned: arrivedRows.length } }, tx);
      return { etdPassed: late.length, arrivedUnsigned: arrivedRows.length };
    });
  }

  private async releasedInspection(orderId: string, styleId: string | null, db: DbOrTx = this.db): Promise<string | null> {
    const rows = await db.select({ id: inspections.id, styleId: inspections.styleId }).from(inspections).where(and(eq(inspections.orderId, orderId), eq(inspections.status, "RELEASED"))).orderBy(desc(inspections.releasedAt));
    return (rows.find((r) => styleId && r.styleId === styleId) ?? rows[0])?.id ?? null;
  }

  private async carrierText(db: DbOrTx, booking: BookingRow): Promise<string | null> {
    const fwd = booking.forwarderId ? (await db.select({ name: forwarders.name }).from(forwarders).where(eq(forwarders.id, booking.forwarderId)))[0]?.name : null;
    const parts = [fwd, booking.carrier].filter((x): x is string => !!x);
    return parts.length ? parts.join(" / ") : null;
  }

  private async usersWithRole(db: DbOrTx, code: string): Promise<string[]> {
    const rows = await db
      .select({ id: users.id })
      .from(users)
      .innerJoin(userRoles, eq(userRoles.userId, users.id))
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .where(and(eq(roles.code, code), eq(roles.status, "ACTIVE"), eq(users.status, "ACTIVE")));
    return [...new Set(rows.map((r) => r.id))];
  }

  private async lookups(db: DbOrTx, rows: { orderId: string; customerId: string; ownerId: string }[]) {
    const uniq = (xs: string[]) => [...new Set(xs)];
    const orders = rows.length ? await db.select({ id: customerOrders.id, poNo: customerOrders.poNo }).from(customerOrders).where(inArray(customerOrders.id, uniq(rows.map((r) => r.orderId)))) : [];
    const custs = rows.length ? await db.select({ id: customers.id, name: customers.name }).from(customers).where(inArray(customers.id, uniq(rows.map((r) => r.customerId)))) : [];
    const owners = rows.length ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, uniq(rows.map((r) => r.ownerId)))) : [];
    return {
      poNo: (id: string) => orders.find((o) => o.id === id)?.poNo ?? "",
      customerName: (id: string) => custs.find((c) => c.id === id)?.name ?? "",
      ownerName: (id: string) => owners.find((o) => o.id === id)?.name ?? "",
    };
  }

  private async toBookingDtos(rows: BookingRow[], db: DbOrTx = this.db): Promise<BookingDto[]> {
    if (!rows.length) return [];
    const look = await this.lookups(db, rows);
    const fwdIds = [...new Set(rows.map((r) => r.forwarderId).filter((x): x is string => !!x))];
    const fwds = fwdIds.length ? await db.select({ id: forwarders.id, name: forwarders.name }).from(forwarders).where(inArray(forwarders.id, fwdIds)) : [];
    const counts = await db.select({ bookingId: shipments.bookingId }).from(shipments).where(inArray(shipments.bookingId, rows.map((r) => r.id)));
    return rows.map((r) => ({
      id: r.id,
      docNo: r.docNo,
      orderId: r.orderId,
      poNo: look.poNo(r.orderId),
      customerId: r.customerId,
      customerName: look.customerName(r.customerId),
      forwarderId: r.forwarderId,
      forwarderName: fwds.find((f) => f.id === r.forwarderId)?.name ?? null,
      carrier: r.carrier,
      vessel: r.vessel,
      voyage: r.voyage,
      blNo: r.blNo,
      transportMode: r.transportMode,
      cutoffDate: r.cutoffDate,
      containerType: r.containerType,
      etd: r.etd,
      eta: r.eta,
      status: r.status as BookingStatus,
      confirmedAt: iso(r.confirmedAt),
      cancelReason: r.cancelReason,
      note: r.note,
      shipmentCount: counts.filter((c) => c.bookingId === r.id).length,
      ownerId: r.ownerId,
      ownerName: look.ownerName(r.ownerId),
      createdAt: r.createdAt.toISOString(),
      version: r.version,
    }));
  }

  private async toDtos(rows: ShipmentRow[], db: DbOrTx = this.db): Promise<ShipmentDto[]> {
    if (!rows.length) return [];
    const look = await this.lookups(db, rows);
    const ids = <T>(xs: (T | null)[]) => [...new Set(xs.filter((x): x is T => x !== null))];
    const styleIds = ids(rows.map((r) => r.styleId));
    const styleRows = styleIds.length ? await db.select({ id: styles.id, styleNo: styles.styleNo, nameZh: styles.nameZh, nameEn: styles.nameEn }).from(styles).where(inArray(styles.id, styleIds)) : [];
    const factoryIds = ids(rows.map((r) => r.factoryId));
    const factoryRows = factoryIds.length ? await db.select({ id: factories.id, name: factories.name }).from(factories).where(inArray(factories.id, factoryIds)) : [];
    const bookingIds = ids(rows.map((r) => r.bookingId));
    const bookingRows = bookingIds.length ? await db.select({ id: bookings.id, docNo: bookings.docNo }).from(bookings).where(inArray(bookings.id, bookingIds)) : [];
    const inspIds = ids(rows.map((r) => r.inspectionId));
    const inspRows = inspIds.length ? await db.select({ id: inspections.id, docNo: inspections.docNo }).from(inspections).where(inArray(inspections.id, inspIds)) : [];
    return rows.map((r) => {
      const style = styleRows.find((s) => s.id === r.styleId);
      return {
        id: r.id,
        docNo: r.docNo,
        orderId: r.orderId,
        poNo: look.poNo(r.orderId),
        customerId: r.customerId,
        customerName: look.customerName(r.customerId),
        bookingId: r.bookingId,
        bookingNo: bookingRows.find((b) => b.id === r.bookingId)?.docNo ?? null,
        styleId: r.styleId,
        styleNo: style?.styleNo ?? null,
        styleName: style?.nameZh ?? null,
        styleNameEn: style?.nameEn ?? null,
        transportMode: r.transportMode,
        destination: r.destination,
        carrierText: r.carrierText,
        blNo: r.blNo,
        etd: r.etd,
        eta: r.eta,
        cartonCount: r.cartonCount,
        pairs: r.pairs,
        grossWeight: r.grossWeight,
        volume: r.volume,
        factoryId: r.factoryId,
        factoryName: factoryRows.find((f) => f.id === r.factoryId)?.name ?? null,
        seasonCode: r.seasonCode,
        inspectionId: r.inspectionId,
        inspectionNo: inspRows.find((i) => i.id === r.inspectionId)?.docNo ?? null,
        status: r.status as ShipmentStatus,
        signedAt: iso(r.signedAt),
        note: r.note,
        ownerId: r.ownerId,
        ownerName: look.ownerName(r.ownerId),
        createdAt: r.createdAt.toISOString(),
        version: r.version,
      };
    });
  }
}

