import { Inject, Injectable, type OnModuleInit } from "@nestjs/common";
import type { Page } from "@otd/contracts/common";
import {
  type CollectionLogDto,
  type CollectionSummaryDto,
  type InvoiceDto,
  type ReceiptDto,
  type ReceivableDetailDto,
  type ReceivableDto,
  type ReceivableKpiDto,
  type ReceivableStatus,
  type collectionCreateSchema,
  type collectionQuerySchema,
  type disputeSchema,
  type invoiceCreateSchema,
  type invoiceListQuerySchema,
  type offsetSchema,
  type receiptCreateSchema,
  type receivableCreateSchema,
  type receivableListQuerySchema,
  receivableErrors,
} from "@otd/contracts/receivable";
import { type Database, type DbOrTx, collectionLogs, customerOrders, customers, exchangeRates, invoices, orderLines, receipts, receivables, shipments, users } from "@otd/db";
import { addDays, canTransition, daysBetween, round } from "@otd/shared";
import { type SQL, and, asc, desc, eq, gt, ilike, inArray, isNull, lt, lte, ne, or } from "drizzle-orm";
import type { z } from "zod";
import { type AccessContext, systemContext } from "../../core/access/access.types.js";
import { assertCanSee, scoped } from "../../core/access/scope.js";
import { AuditService } from "../../core/audit.service.js";
import { Clock } from "../../core/clock.js";
import { AppError, assertFound, duplicate, illegalTransition, versionConflict } from "../../core/errors.js";
import { EventBus, inTransaction } from "../../core/events.js";
import { NumberingService } from "../../core/numbering.service.js";
import { countAll, likeKeyword, orderBy, paginate } from "../../core/paging.js";
import { Scheduler } from "../../core/scheduler.js";
import { DB } from "../../core/tokens.js";
import { NotificationService } from "../notification/notification.service.js";
import { TodoService } from "../todo/todo.service.js";

type Row = typeof receivables.$inferSelect;
type LogRow = typeof collectionLogs.$inferSelect;
type CustomerRow = typeof customers.$inferSelect;

const OPEN: ReceivableStatus[] = ["NOT_DUE", "DUE", "PARTIAL"];
const CLOSED: ReceivableStatus[] = ["PAID", "OFFSET"];
const EPS = 0.005;
const dueAt = (date: string) => new Date(`${date}T10:00:00.000Z`);

@Injectable()
export class ReceivableService implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly audit: AuditService,
    private readonly numbering: NumberingService,
    private readonly events: EventBus,
    private readonly clock: Clock,
    private readonly todos: TodoService,
    private readonly notifications: NotificationService,
    private readonly scheduler: Scheduler,
  ) {}

  onModuleInit(): void {
    this.events.on("shipment.shipment.signed", "receivable.fromShipment", async (event) => {
      await this.createFromShipment(String(event.payload.shipmentId ?? event.aggregateId), typeof event.payload.signedDate === "string" ? event.payload.signedDate : this.clock.today());
    });
    this.scheduler.register({ name: "receivable.daily", dailyAt: "01:30", run: () => this.runDaily() });
  }

  private visible(ctx: AccessContext): SQL {
    return scoped(receivables, ctx);
  }

  private async load(ctx: AccessContext, id: string, db: DbOrTx = this.db): Promise<Row> {
    return assertCanSee(ctx, (await db.select().from(receivables).where(eq(receivables.id, id)))[0]);
  }

  async createFromShipment(shipmentId: string, signedDate: string): Promise<ReceivableDto | null> {
    const row = await inTransaction(this.db, this.events, async (tx, emit) => {
      const existing = (await tx.select({ id: receivables.id }).from(receivables).where(and(eq(receivables.shipmentId, shipmentId), eq(receivables.type, "GOODS"))))[0];
      if (existing) return null;
      const shipment = (await tx.select().from(shipments).where(eq(shipments.id, shipmentId)))[0];
      if (!shipment) return null;
      const order = (await tx.select().from(customerOrders).where(eq(customerOrders.id, shipment.orderId)))[0]!;
      const customer = (await tx.select().from(customers).where(eq(customers.id, order.customerId)))[0]!;
      const lines = await tx.select().from(orderLines).where(eq(orderLines.orderId, order.id));
      const styleLines = shipment.styleId ? lines.filter((l) => l.styleId === shipment.styleId) : [];
      const priced = (styleLines.length ? styleLines : lines).filter((l) => l.unitPrice !== null && l.quantity > 0);
      const qty = priced.reduce((s, l) => s + l.quantity, 0);
      const avgPrice = qty ? priced.reduce((s, l) => s + l.quantity * (l.unitPrice ?? 0), 0) / qty : 0;
      const pairs = shipment.pairs ?? 0;
      const amount = round(pairs * avgPrice, 2);
      const dueDate = addDays(signedDate, customer.paymentTermsDays);
      const docNo = await this.numbering.next("receivable", tx);
      const created = (
        await tx
          .insert(receivables)
          .values({
            docNo,
            settlementEntity: customer.settlementEntity,
            sourceType: "SHIPMENT",
            sourceNo: shipment.docNo,
            orderId: order.id,
            shipmentId,
            type: "GOODS",
            amount,
            currency: order.currency,
            dueDate,
            status: dueDate <= this.clock.today() ? "DUE" : "NOT_DUE",
            missingData: amount <= 0,
            ownerId: order.ownerId,
            orgId: order.orgId,
            customerId: order.customerId,
          })
          .returning()
      )[0]!;
      await this.audit.log(systemContext(), { action: "receivable.receivable.create", objectType: "receivable", objectId: created.id, docNo, diff: { source: { from: null, to: shipment.docNo }, amount: { from: null, to: amount } } }, tx);
      await this.notifications.notify([order.ownerId], { type: "receivable.created", title: `${docNo} 已生成：${order.currency} ${amount.toFixed(2)}`, body: `${shipment.docNo} 签收，到期日 ${dueDate}`, link: `/receivables/${created.id}` }, tx);
      emit({ type: "receivable.receivable.created", aggregateType: "receivable", aggregateId: created.id, payload: { docNo, orderId: order.id, shipmentId, amount, currency: order.currency } });
      return created;
    });
    if (!row) return null;
    return (await this.toDtos([row]))[0]!;
  }

  async list(ctx: AccessContext, q: z.infer<typeof receivableListQuerySchema>): Promise<Page<ReceivableDto>> {
    const where = and(...(await this.filters(ctx, q)));
    const sort = orderBy(q.sort, { docNo: receivables.docNo, dueDate: receivables.dueDate, amount: receivables.amount, createdAt: receivables.createdAt }, [asc(receivables.dueDate), desc(receivables.createdAt)]);
    return paginate(
      q,
      async () => (await this.db.select({ n: countAll }).from(receivables).where(where))[0]!.n,
      async (limit, offset) => this.toDtos(await this.db.select().from(receivables).where(where).orderBy(...sort).limit(limit).offset(offset)),
    );
  }

  private async filters(ctx: AccessContext, q: Partial<z.infer<typeof receivableListQuerySchema>>): Promise<SQL[]> {
    const today = this.clock.today();
    const conds: SQL[] = [this.visible(ctx)];
    if (q.customerId) conds.push(eq(receivables.customerId, q.customerId));
    if (q.status?.length) conds.push(inArray(receivables.status, q.status));
    if (q.type?.length) conds.push(inArray(receivables.type, q.type));
    if (q.settlementEntity) conds.push(eq(receivables.settlementEntity, q.settlementEntity));
    if (q.orderId) conds.push(eq(receivables.orderId, q.orderId));
    if (q.overdue) conds.push(inArray(receivables.status, OPEN), gt(receivables.amount, 0), lt(receivables.dueDate, today));
    if (q.missingData) conds.push(eq(receivables.missingData, true));
    const kw = likeKeyword(q.keyword);
    if (kw) {
      const custIds = (await this.db.select({ id: customers.id }).from(customers).where(or(ilike(customers.name, kw), ilike(customers.nameEn, kw), ilike(customers.code, kw)))).map((c) => c.id);
      const ownerIds = (await this.db.select({ id: users.id }).from(users).where(ilike(users.name, kw))).map((u) => u.id);
      const orderIds = (await this.db.select({ id: customerOrders.id }).from(customerOrders).where(ilike(customerOrders.poNo, kw))).map((o) => o.id);
      const parts: SQL[] = [ilike(receivables.docNo, kw), ilike(receivables.sourceNo, kw)];
      if (custIds.length) parts.push(inArray(receivables.customerId, custIds));
      if (ownerIds.length) parts.push(inArray(receivables.ownerId, ownerIds));
      if (orderIds.length) parts.push(inArray(receivables.orderId, orderIds));
      conds.push(or(...parts)!);
    }
    return conds;
  }

  async kpis(ctx: AccessContext, q: Partial<z.infer<typeof receivableListQuerySchema>> = {}): Promise<ReceivableKpiDto> {
    const today = this.clock.today();
    const month = today.slice(0, 7);
    const rows = await this.db.select().from(receivables).where(and(...(await this.filters(ctx, { ...q, status: undefined }))));
    const fx = await this.rates();
    const open = rows.filter((r) => !CLOSED.includes(r.status as ReceivableStatus));
    const overdue = open.filter((r) => isOverdue(r, today));
    return {
      balanceUsd: round(open.reduce((s, r) => s + fx.toUsd(r.amount - r.receivedAmount, r.currency), 0), 2),
      overdueUsd: round(overdue.reduce((s, r) => s + fx.toUsd(r.amount - r.receivedAmount, r.currency), 0), 2),
      overdueCount: overdue.length,
      avgOverdueDays: overdue.length ? round(overdue.reduce((s, r) => s + daysBetween(r.dueDate, today), 0) / overdue.length, 1) : 0,
      dueThisMonth: open.filter((r) => r.dueDate.startsWith(month)).length,
      missingData: rows.filter((r) => r.missingData).length,
    };
  }

  async get(ctx: AccessContext, id: string): Promise<ReceivableDetailDto> {
    const row = await this.load(ctx, id);
    const dto = (await this.toDtos([row]))[0]!;
    const receiptRows = await this.db.select().from(receipts).where(eq(receipts.receivableId, id)).orderBy(asc(receipts.receivedAt), asc(receipts.createdAt));
    const logRows = await this.db.select().from(collectionLogs).where(eq(collectionLogs.receivableId, id)).orderBy(desc(collectionLogs.createdAt));
    const names = await this.userNames([...receiptRows.map((r) => r.createdBy), ...logRows.map((l) => l.createdBy)]);
    return {
      ...dto,
      receipts: receiptRows.map((r): ReceiptDto => ({ id: r.id, amount: r.amount, currency: r.currency, receivedAt: r.receivedAt, method: r.method, bankRef: r.bankRef, note: r.note, createdByName: r.createdBy ? (names.get(r.createdBy) ?? null) : null, createdAt: r.createdAt.toISOString() })),
      collections: logRows.map((l) => toLogDto(l, names)),
    };
  }

  async create(ctx: AccessContext, input: z.infer<typeof receivableCreateSchema>): Promise<ReceivableDto> {
    if ((input.type === "DEDUCTION") !== input.amount < 0) throw new AppError(receivableErrors.RECEIVABLE_AMOUNT_SIGN);
    const row = await inTransaction(this.db, this.events, async (tx, emit) => {
      const shipment = input.shipmentId ? assertCanSee(ctx, (await tx.select().from(shipments).where(eq(shipments.id, input.shipmentId)))[0]) : undefined;
      const orderId = input.orderId ?? shipment?.orderId ?? null;
      const order = orderId ? assertCanSee(ctx, (await tx.select().from(customerOrders).where(eq(customerOrders.id, orderId)))[0]) : undefined;
      const customerId = order?.customerId ?? input.customerId;
      if (!customerId) throw new AppError(receivableErrors.RECEIVABLE_CUSTOMER_REQUIRED);
      const customer = assertFound((await tx.select().from(customers).where(eq(customers.id, customerId)))[0]);
      const ownerId = order?.ownerId ?? ctx.userId;
      const orgId = order?.orgId ?? ctx.orgId;
      assertCanSee(ctx, { ownerId, orgId, customerId });
      const dueDate = input.dueDate ?? addDays(this.clock.today(), customer.paymentTermsDays);
      const docNo = await this.numbering.next("receivable", tx);
      const status: ReceivableStatus = input.amount < 0 ? "OFFSET_PENDING" : dueDate <= this.clock.today() ? "DUE" : "NOT_DUE";
      const created = (
        await tx
          .insert(receivables)
          .values({
            docNo,
            settlementEntity: input.settlementEntity ?? customer.settlementEntity,
            sourceType: shipment ? "SHIPMENT" : order ? "ORDER" : "MANUAL",
            sourceNo: input.sourceNo ?? shipment?.docNo ?? order?.poNo ?? null,
            orderId: order?.id ?? null,
            shipmentId: shipment?.id ?? null,
            type: input.type,
            amount: round(input.amount, 2),
            currency: input.currency ?? order?.currency ?? customer.currency,
            dueDate,
            status,
            missingData: !input.dueDate,
            note: input.note ?? null,
            ownerId,
            orgId,
            customerId,
            createdBy: ctx.userId,
          })
          .returning()
      )[0]!;
      await this.audit.log(ctx, { action: "receivable.receivable.create", objectType: "receivable", objectId: created.id, docNo }, tx);
      emit({ type: "receivable.receivable.created", aggregateType: "receivable", aggregateId: created.id, payload: { docNo, orderId: created.orderId, type: input.type, amount: created.amount, currency: created.currency } });
      return created;
    });
    return (await this.toDtos([row]))[0]!;
  }

  async addReceipt(ctx: AccessContext, id: string, input: z.infer<typeof receiptCreateSchema>): Promise<ReceivableDto> {
    const row = await inTransaction(this.db, this.events, async (tx, emit) => {
      const before = await this.load(ctx, id, tx);
      if (before.version !== input.version) throw versionConflict();
      if (before.status === "OFFSET_PENDING") throw new AppError(receivableErrors.RECEIVABLE_NOT_OFFSET);
      if (input.currency && input.currency !== before.currency) throw new AppError(receivableErrors.RECEIVABLE_CURRENCY_MISMATCH, { expected: before.currency });
      const updated = await this.applyReceipt(tx, ctx, before, input.amount, { receivedAt: input.receivedAt, method: input.method ?? null, bankRef: input.bankRef ?? null, note: input.note ?? null });
      emit({ type: `receivable.receivable.${updated.status === "PAID" ? "paid" : "receipted"}`, aggregateType: "receivable", aggregateId: id, payload: { docNo: before.docNo, orderId: before.orderId, amount: input.amount, currency: before.currency, status: updated.status } });
      return updated;
    });
    return (await this.toDtos([row]))[0]!;
  }

  async offset(ctx: AccessContext, id: string, input: z.infer<typeof offsetSchema>): Promise<ReceivableDto> {
    const row = await inTransaction(this.db, this.events, async (tx, emit) => {
      const source = await this.load(ctx, id, tx);
      if (source.version !== input.version) throw versionConflict();
      if (!canTransition("receivable", source.status as ReceivableStatus, "OFFSET")) throw illegalTransition(source.status, "offset");
      const target = await this.load(ctx, input.targetId, tx);
      const credit = Math.abs(source.amount);
      const outstanding = target.amount - target.receivedAmount;
      if (target.id === source.id || target.customerId !== source.customerId || target.currency !== source.currency || !OPEN.includes(target.status as ReceivableStatus) || outstanding + EPS < credit) {
        throw new AppError(receivableErrors.RECEIVABLE_OFFSET_TARGET_INVALID);
      }
      await this.applyReceipt(tx, ctx, target, credit, { receivedAt: this.clock.today(), method: "OFFSET", bankRef: source.docNo, note: input.note ?? `冲抵 ${source.docNo}` });
      const updated = (
        await tx
          .update(receivables)
          .set({ status: "OFFSET", receivedAmount: source.amount, offsetTargetId: target.id, version: source.version + 1, updatedBy: ctx.userId })
          .where(and(eq(receivables.id, id), eq(receivables.version, source.version)))
          .returning()
      )[0];
      if (!updated) throw versionConflict();
      await this.audit.log(ctx, { action: "receivable.receivable.offset", objectType: "receivable", objectId: id, docNo: source.docNo, diff: { status: { from: source.status, to: "OFFSET" }, target: { from: null, to: target.docNo } } }, tx);
      emit({ type: "receivable.receivable.offset", aggregateType: "receivable", aggregateId: id, payload: { docNo: source.docNo, orderId: source.orderId, targetId: target.id, targetOrderId: target.orderId, amount: source.amount } });
      return updated;
    });
    return (await this.toDtos([row]))[0]!;
  }

  private async applyReceipt(tx: DbOrTx, ctx: AccessContext, before: Row, amount: number, meta: { receivedAt: string; method: string | null; bankRef: string | null; note: string | null }): Promise<Row> {
    if (before.amount <= 0) throw new AppError(receivableErrors.RECEIVABLE_NOT_OFFSET);
    const outstanding = round(before.amount - before.receivedAmount, 2);
    if (amount > outstanding + EPS) throw new AppError(receivableErrors.RECEIVABLE_OVERPAID, { outstanding: `${before.currency} ${outstanding.toFixed(2)}` });
    const received = round(before.receivedAmount + amount, 2);
    const to: ReceivableStatus = received + EPS >= before.amount ? "PAID" : "PARTIAL";
    const from = before.status as ReceivableStatus;
    if (to !== from && !canTransition("receivable", from, to)) throw illegalTransition(before.status, "receipt");
    if (to === from && from !== "PARTIAL") throw illegalTransition(before.status, "receipt");
    await tx.insert(receipts).values({ receivableId: before.id, amount, currency: before.currency, receivedAt: meta.receivedAt, method: meta.method, bankRef: meta.bankRef, note: meta.note, createdBy: ctx.system ? null : ctx.userId });
    const updated = (
      await tx
        .update(receivables)
        .set({ receivedAmount: received, status: to, version: before.version + 1, updatedBy: ctx.system ? null : ctx.userId })
        .where(and(eq(receivables.id, before.id), eq(receivables.version, before.version)))
        .returning()
    )[0];
    if (!updated) throw versionConflict();
    await this.audit.log(ctx, { action: "receivable.receivable.receipt", objectType: "receivable", objectId: before.id, docNo: before.docNo, diff: { status: { from, to }, receivedAmount: { from: before.receivedAmount, to: received } } }, tx);
    if (to === "PAID") await this.todos.closeForDoc("receivable", before.id, tx);
    return updated;
  }

  async logCollection(ctx: AccessContext, id: string, input: z.infer<typeof collectionCreateSchema>): Promise<ReceivableDto> {
    const row = await inTransaction(this.db, this.events, async (tx, emit) => {
      const before = await this.load(ctx, id, tx);
      await tx.insert(collectionLogs).values({ receivableId: id, channel: input.channel, result: input.result, note: input.note ?? null, nextFollowUp: input.nextFollowUp ?? null, createdBy: ctx.userId, createdAt: this.clock.now() });
      let updated = before;
      if (input.result === "DISPUTED" && !before.disputed) {
        updated = (await tx.update(receivables).set({ disputed: true, version: before.version + 1, updatedBy: ctx.userId }).where(eq(receivables.id, id)).returning())[0]!;
      }
      await this.todos.closeByPrefix(`receivable:overdue:${id}`, tx);
      await this.todos.closeByPrefix(`receivable:followup:${id}`, tx);
      if (input.nextFollowUp && OPEN.includes(before.status as ReceivableStatus)) {
        await this.todos.upsert({ fingerprint: `receivable:followup:${id}`, source: "FLOW", action: "receivable.followUp", title: `催收跟进 ${before.docNo}`, description: input.note ?? null, docType: "receivable", docId: id, docNo: before.docNo, link: `/receivables/${id}`, customerId: before.customerId, assigneeId: before.ownerId, dueAt: dueAt(input.nextFollowUp) }, tx);
      }
      await this.audit.log(ctx, { action: "receivable.collection.log", objectType: "receivable", objectId: id, docNo: before.docNo, diff: { channel: { from: null, to: input.channel }, result: { from: null, to: input.result } } }, tx);
      emit({ type: "receivable.collection.logged", aggregateType: "receivable", aggregateId: id, payload: { docNo: before.docNo, orderId: before.orderId, result: input.result } });
      return updated;
    });
    return (await this.toDtos([row]))[0]!;
  }

  async setDispute(ctx: AccessContext, id: string, input: z.infer<typeof disputeSchema>): Promise<ReceivableDto> {
    const row = await inTransaction(this.db, this.events, async (tx) => {
      const before = await this.load(ctx, id, tx);
      if (before.version !== input.version) throw versionConflict();
      const updated = (await tx.update(receivables).set({ disputed: input.disputed, version: before.version + 1, updatedBy: ctx.userId }).where(and(eq(receivables.id, id), eq(receivables.version, before.version))).returning())[0];
      if (!updated) throw versionConflict();
      await this.audit.log(ctx, { action: "receivable.receivable.dispute", objectType: "receivable", objectId: id, docNo: before.docNo, diff: { disputed: { from: before.disputed, to: input.disputed } } }, tx);
      return updated;
    });
    return (await this.toDtos([row]))[0]!;
  }

  async collection(ctx: AccessContext, q: z.infer<typeof collectionQuerySchema>): Promise<Page<ReceivableDto>> {
    const { buckets } = await this.collectionBuckets(ctx, q.customerId);
    const rows = buckets[q.tab].sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.docNo.localeCompare(b.docNo));
    const start = (q.page - 1) * q.pageSize;
    return { items: await this.toDtos(rows.slice(start, start + q.pageSize)), total: rows.length, page: q.page, pageSize: q.pageSize };
  }

  async collectionSummary(ctx: AccessContext, customerId?: string): Promise<CollectionSummaryDto> {
    const today = this.clock.today();
    const month = today.slice(0, 7);
    const { buckets, overdue, logs } = await this.collectionBuckets(ctx, customerId);
    const fx = await this.rates();
    const outstandingUsd = (r: Row) => fx.toUsd(r.amount - r.receivedAmount, r.currency);
    const visibleIds = await this.db.select({ id: receivables.id }).from(receivables).where(and(...(await this.filters(ctx, { customerId }))));
    const receiptRows = visibleIds.length ? await this.db.select().from(receipts).where(and(inArray(receipts.receivableId, visibleIds.map((v) => v.id)), or(isNull(receipts.method), ne(receipts.method, "OFFSET")))) : [];
    const monthReceipts = receiptRows.filter((r) => r.receivedAt.startsWith(month));
    const untouched = overdue.filter((r) => !logs.has(r.id));
    const owners = await this.userNames(overdue.map((r) => r.ownerId));
    const team = new Map<string, { ownerId: string; ownerName: string; overdueCount: number; overdueUsd: number; untouched: number }>();
    for (const r of overdue) {
      const t = team.get(r.ownerId) ?? { ownerId: r.ownerId, ownerName: owners.get(r.ownerId) ?? "", overdueCount: 0, overdueUsd: 0, untouched: 0 };
      t.overdueCount += 1;
      t.overdueUsd = round(t.overdueUsd + outstandingUsd(r), 2);
      if (!logs.has(r.id)) t.untouched += 1;
      team.set(r.ownerId, t);
    }
    return {
      overdueUsd: round(overdue.reduce((s, r) => s + outstandingUsd(r), 0), 2),
      overdueCount: overdue.length,
      avgOverdueDays: overdue.length ? round(overdue.reduce((s, r) => s + daysBetween(r.dueDate, today), 0) / overdue.length, 1) : 0,
      todayFollowUps: buckets.today.length,
      collectedThisMonthUsd: round(monthReceipts.reduce((s, r) => s + fx.toUsd(r.amount, r.currency), 0), 2),
      untouched: untouched.length,
      tabs: { all: buckets.all.length, mine: buckets.mine.length, today: buckets.today.length, team: buckets.team.length },
      team: [...team.values()].sort((a, b) => b.overdueUsd - a.overdueUsd),
    };
  }

  private async collectionBuckets(ctx: AccessContext, customerId?: string) {
    const today = this.clock.today();
    const conds: SQL[] = [this.visible(ctx), inArray(receivables.status, OPEN), gt(receivables.amount, 0)];
    if (customerId) conds.push(eq(receivables.customerId, customerId));
    const rows = await this.db.select().from(receivables).where(and(...conds));
    const logRows = rows.length ? await this.db.select().from(collectionLogs).where(inArray(collectionLogs.receivableId, rows.map((r) => r.id))).orderBy(desc(collectionLogs.createdAt)) : [];
    const logs = new Map<string, LogRow>();
    for (const l of logRows) if (!logs.has(l.receivableId)) logs.set(l.receivableId, l);
    const overdue = rows.filter((r) => isOverdue(r, today));
    const followUp = rows.filter((r) => {
      const next = logs.get(r.id)?.nextFollowUp;
      return !!next && next <= today;
    });
    const all = [...new Map([...overdue, ...followUp].map((r) => [r.id, r])).values()];
    return {
      overdue,
      logs,
      buckets: { all, mine: overdue.filter((r) => r.ownerId === ctx.userId), today: followUp, team: all } as Record<"all" | "mine" | "today" | "team", Row[]>,
    };
  }

  async listInvoices(ctx: AccessContext, q: z.infer<typeof invoiceListQuerySchema>): Promise<Page<InvoiceDto>> {
    const conds: SQL[] = [scoped(invoices, ctx)];
    if (q.customerId) conds.push(eq(invoices.customerId, q.customerId));
    if (q.orderId) conds.push(eq(invoices.orderId, q.orderId));
    const kw = likeKeyword(q.keyword);
    if (kw) conds.push(ilike(invoices.invoiceNo, kw));
    const where = and(...conds);
    return paginate(
      q,
      async () => (await this.db.select({ n: countAll }).from(invoices).where(where))[0]!.n,
      async (limit, offset) => this.toInvoiceDtos(await this.db.select().from(invoices).where(where).orderBy(desc(invoices.issuedDate), desc(invoices.createdAt)).limit(limit).offset(offset)),
    );
  }

  async createInvoice(ctx: AccessContext, input: z.infer<typeof invoiceCreateSchema>): Promise<InvoiceDto> {
    const row = await inTransaction(this.db, this.events, async (tx, emit) => {
      if ((await tx.select({ id: invoices.id }).from(invoices).where(eq(invoices.invoiceNo, input.invoiceNo)))[0]) throw duplicate("发票号");
      let ar = input.receivableId ? await this.load(ctx, input.receivableId, tx) : undefined;
      const shipment = input.shipmentId ? assertCanSee(ctx, (await tx.select().from(shipments).where(eq(shipments.id, input.shipmentId)))[0]) : undefined;
      if (!ar && shipment) ar = (await tx.select().from(receivables).where(and(eq(receivables.shipmentId, shipment.id), eq(receivables.type, "GOODS"))))[0];
      const orderId = input.orderId ?? ar?.orderId ?? shipment?.orderId ?? null;
      const order = orderId ? assertCanSee(ctx, (await tx.select().from(customerOrders).where(eq(customerOrders.id, orderId)))[0]) : undefined;
      const customerId = ar?.customerId ?? order?.customerId;
      if (!customerId) throw new AppError(receivableErrors.RECEIVABLE_CUSTOMER_REQUIRED);
      const currency = input.currency ?? ar?.currency ?? order?.currency ?? "USD";
      if (ar && currency !== ar.currency) throw new AppError(receivableErrors.RECEIVABLE_CURRENCY_MISMATCH, { expected: ar.currency });
      const created = (
        await tx
          .insert(invoices)
          .values({
            invoiceNo: input.invoiceNo,
            orderId: order?.id ?? null,
            shipmentId: shipment?.id ?? ar?.shipmentId ?? null,
            receivableId: ar?.id ?? null,
            amount: input.amount,
            currency,
            issuedDate: input.issuedDate,
            note: input.note ?? null,
            ownerId: ar?.ownerId ?? order?.ownerId ?? ctx.userId,
            orgId: ar?.orgId ?? order?.orgId ?? ctx.orgId,
            customerId,
            createdBy: ctx.userId,
          })
          .returning()
      )[0]!;
      if (ar) {
        const customer = (await tx.select().from(customers).where(eq(customers.id, ar.customerId)))[0] as CustomerRow;
        const dueDate = addDays(input.issuedDate, customer.paymentTermsDays);
        const status = ar.status === "NOT_DUE" && dueDate <= this.clock.today() ? "DUE" : ar.status;
        await tx.update(receivables).set({ invoiceId: created.id, dueDate, status, missingData: false, version: ar.version + 1, updatedBy: ctx.userId }).where(eq(receivables.id, ar.id));
        await this.audit.log(ctx, { action: "receivable.receivable.invoice", objectType: "receivable", objectId: ar.id, docNo: ar.docNo, diff: { dueDate: { from: ar.dueDate, to: dueDate }, invoiceNo: { from: null, to: input.invoiceNo } } }, tx);
      }
      await this.audit.log(ctx, { action: "receivable.invoice.create", objectType: "invoice", objectId: created.id, docNo: input.invoiceNo }, tx);
      emit({ type: "receivable.invoice.created", aggregateType: "invoice", aggregateId: created.id, payload: { invoiceNo: input.invoiceNo, receivableId: ar?.id ?? null } });
      return created;
    });
    return (await this.toInvoiceDtos([row]))[0]!;
  }

  async runDaily(): Promise<{ becameDue: number; overdueNotified: number }> {
    const today = this.clock.today();
    const ctx = systemContext();
    return inTransaction(this.db, this.events, async (tx, emit) => {
      const due = await tx.select().from(receivables).where(and(eq(receivables.status, "NOT_DUE"), gt(receivables.amount, 0), lte(receivables.dueDate, today)));
      for (const r of due) {
        await tx.update(receivables).set({ status: "DUE", version: r.version + 1 }).where(eq(receivables.id, r.id));
        await this.audit.log(ctx, { action: "receivable.receivable.due", objectType: "receivable", objectId: r.id, docNo: r.docNo, diff: { status: { from: "NOT_DUE", to: "DUE" } } }, tx);
      }
      const overdue = await tx
        .select()
        .from(receivables)
        .where(and(inArray(receivables.status, OPEN), gt(receivables.amount, 0), lt(receivables.dueDate, today), isNull(receivables.overdueNotifiedAt), eq(receivables.disputed, false)));
      for (const r of overdue) {
        const days = daysBetween(r.dueDate, today);
        const outstanding = round(r.amount - r.receivedAmount, 2);
        await this.todos.upsert({ fingerprint: `receivable:overdue:${r.id}`, source: "FLOW", action: "receivable.overdue", title: `应收逾期 ${r.docNo}`, description: `${r.currency} ${outstanding.toFixed(2)} · 逾期 ${days} 天`, docType: "receivable", docId: r.id, docNo: r.docNo, link: `/receivables/${r.id}`, customerId: r.customerId, assigneeId: r.ownerId, dueAt: dueAt(today) }, tx);
        await this.notifications.notify([r.ownerId], { type: "receivable.overdue", title: `${r.docNo} 已逾期 ${days} 天`, body: `${r.currency} ${outstanding.toFixed(2)} 未收`, link: `/receivables/${r.id}` }, tx);
        await tx.update(receivables).set({ overdueNotifiedAt: this.clock.now() }).where(eq(receivables.id, r.id));
        emit({ type: "receivable.receivable.overdue", aggregateType: "receivable", aggregateId: r.id, payload: { docNo: r.docNo, orderId: r.orderId, overdueDays: days } });
      }
      return { becameDue: due.length, overdueNotified: overdue.length };
    });
  }

  private async rates(): Promise<{ toUsd: (amount: number, currency: string) => number }> {
    const today = this.clock.today();
    const rows = await this.db.select().from(exchangeRates).orderBy(desc(exchangeRates.effectiveDate));
    const rate = (cur: string) => (rows.find((r) => r.currency === cur && r.effectiveDate <= today) ?? rows.find((r) => r.currency === cur))?.rateToCny;
    const usd = rate("USD") ?? 1;
    return {
      toUsd: (amount, currency) => {
        if (currency === "USD") return amount;
        const r = currency === "CNY" ? (rate("CNY") ?? 1) : rate(currency);
        return r === undefined ? 0 : (amount * r) / usd;
      },
    };
  }

  private async userNames(ids: (string | null)[]): Promise<Map<string, string>> {
    const uniq = [...new Set(ids.filter((x): x is string => !!x))];
    if (!uniq.length) return new Map();
    return new Map((await this.db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, uniq))).map((u) => [u.id, u.name]));
  }

  private async toDtos(rows: Row[], db: DbOrTx = this.db): Promise<ReceivableDto[]> {
    if (!rows.length) return [];
    const today = this.clock.today();
    const ids = <T>(xs: (T | null)[]) => [...new Set(xs.filter((x): x is T => x !== null))];
    const custs = await db.select({ id: customers.id, name: customers.name }).from(customers).where(inArray(customers.id, ids(rows.map((r) => r.customerId))));
    const owners = await this.userNames(rows.map((r) => r.ownerId));
    const orderIds = ids(rows.map((r) => r.orderId));
    const orders = orderIds.length ? await db.select({ id: customerOrders.id, poNo: customerOrders.poNo }).from(customerOrders).where(inArray(customerOrders.id, orderIds)) : [];
    const shipmentIds = ids(rows.map((r) => r.shipmentId));
    const ships = shipmentIds.length ? await db.select({ id: shipments.id, docNo: shipments.docNo }).from(shipments).where(inArray(shipments.id, shipmentIds)) : [];
    const invoiceIds = ids(rows.map((r) => r.invoiceId));
    const invs = invoiceIds.length ? await db.select({ id: invoices.id, invoiceNo: invoices.invoiceNo }).from(invoices).where(inArray(invoices.id, invoiceIds)) : [];
    const logRows = await db.select().from(collectionLogs).where(inArray(collectionLogs.receivableId, rows.map((r) => r.id))).orderBy(desc(collectionLogs.createdAt));
    return rows.map((r) => {
      const logs = logRows.filter((l) => l.receivableId === r.id);
      const last = logs[0];
      const overdue = isOverdue(r, today);
      const received = r.receivedAmount;
      return {
        id: r.id,
        docNo: r.docNo,
        customerId: r.customerId,
        customerName: custs.find((c) => c.id === r.customerId)?.name ?? "",
        settlementEntity: r.settlementEntity,
        sourceType: r.sourceType,
        sourceNo: r.sourceNo,
        orderId: r.orderId,
        poNo: orders.find((o) => o.id === r.orderId)?.poNo ?? null,
        shipmentId: r.shipmentId,
        shipmentNo: ships.find((s) => s.id === r.shipmentId)?.docNo ?? null,
        invoiceId: r.invoiceId,
        invoiceNo: invs.find((i) => i.id === r.invoiceId)?.invoiceNo ?? null,
        type: r.type as ReceivableDto["type"],
        amount: r.amount,
        currency: r.currency,
        dueDate: r.dueDate,
        receivedAmount: received,
        outstanding: round(r.amount - received, 2),
        progress: r.amount !== 0 ? Math.max(0, Math.min(1, round(received / r.amount, 4))) : 0,
        status: r.status as ReceivableStatus,
        overdue,
        overdueDays: overdue ? daysBetween(r.dueDate, today) : 0,
        disputed: r.disputed,
        missingData: r.missingData,
        note: r.note,
        collectionCount: logs.length,
        lastCollection: last ? { channel: last.channel as CollectionLogDto["channel"], result: last.result as CollectionLogDto["result"], at: last.createdAt.toISOString() } : null,
        nextFollowUp: last?.nextFollowUp ?? null,
        ownerId: r.ownerId,
        ownerName: owners.get(r.ownerId) ?? "",
        createdAt: r.createdAt.toISOString(),
        version: r.version,
      };
    });
  }

  private async toInvoiceDtos(rows: (typeof invoices.$inferSelect)[]): Promise<InvoiceDto[]> {
    if (!rows.length) return [];
    const ids = <T>(xs: (T | null)[]) => [...new Set(xs.filter((x): x is T => x !== null))];
    const custs = await this.db.select({ id: customers.id, name: customers.name }).from(customers).where(inArray(customers.id, ids(rows.map((r) => r.customerId))));
    const owners = await this.userNames(rows.map((r) => r.ownerId));
    const orderIds = ids(rows.map((r) => r.orderId));
    const orders = orderIds.length ? await this.db.select({ id: customerOrders.id, poNo: customerOrders.poNo }).from(customerOrders).where(inArray(customerOrders.id, orderIds)) : [];
    const shipmentIds = ids(rows.map((r) => r.shipmentId));
    const ships = shipmentIds.length ? await this.db.select({ id: shipments.id, docNo: shipments.docNo }).from(shipments).where(inArray(shipments.id, shipmentIds)) : [];
    const arIds = ids(rows.map((r) => r.receivableId));
    const ars = arIds.length ? await this.db.select({ id: receivables.id, docNo: receivables.docNo }).from(receivables).where(inArray(receivables.id, arIds)) : [];
    return rows.map((r) => ({
      id: r.id,
      invoiceNo: r.invoiceNo,
      customerId: r.customerId,
      customerName: custs.find((c) => c.id === r.customerId)?.name ?? "",
      orderId: r.orderId,
      poNo: orders.find((o) => o.id === r.orderId)?.poNo ?? null,
      shipmentId: r.shipmentId,
      shipmentNo: ships.find((s) => s.id === r.shipmentId)?.docNo ?? null,
      receivableId: r.receivableId,
      receivableNo: ars.find((a) => a.id === r.receivableId)?.docNo ?? null,
      amount: r.amount,
      currency: r.currency,
      issuedDate: r.issuedDate,
      note: r.note,
      ownerId: r.ownerId,
      ownerName: owners.get(r.ownerId) ?? "",
      createdAt: r.createdAt.toISOString(),
      version: r.version,
    }));
  }
}

function isOverdue(r: Row, today: string): boolean {
  return OPEN.includes(r.status as ReceivableStatus) && r.amount > 0 && r.dueDate < today;
}

function toLogDto(l: LogRow, names: Map<string, string>): CollectionLogDto {
  return {
    id: l.id,
    channel: l.channel as CollectionLogDto["channel"],
    result: l.result as CollectionLogDto["result"],
    note: l.note,
    nextFollowUp: l.nextFollowUp,
    createdByName: l.createdBy ? (names.get(l.createdBy) ?? null) : null,
    createdAt: l.createdAt.toISOString(),
  };
}

