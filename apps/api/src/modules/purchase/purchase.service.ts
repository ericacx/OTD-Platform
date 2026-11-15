import { Inject, Injectable, type OnModuleInit } from "@nestjs/common";
import type { Page } from "@otd/contracts/common";
import {
  type PurchaseDetailDto,
  type PurchaseDto,
  type PurchaseMaterialDto,
  type PurchaseReceiptDto,
  type PurchaseRequirementDto,
  type purchaseCreateSchema,
  type purchaseListQuerySchema,
  type purchaseReceiptListQuerySchema,
  type purchaseReceiveSchema,
  purchaseErrors,
} from "@otd/contracts/purchase";
import {
  type Database,
  type DbOrTx,
  customerOrders,
  customers,
  materials,
  orderLines,
  packagingPlanVersions,
  packagingPlans,
  purchaseLines,
  purchaseOrders,
  purchaseReceipts,
  roles,
  samples,
  userRoles,
  users,
} from "@otd/db";
import { canTransition } from "@otd/shared";
import { type SQL, and, asc, desc, eq, gte, ilike, inArray, isNotNull, isNull, lt, lte, ne, or } from "drizzle-orm";
import type { z } from "zod";
import { type AccessContext, canSeeCustomer, systemContext } from "../../core/access/access.types.js";
import { assertCanSee, ownership, scoped } from "../../core/access/scope.js";
import { AuditService } from "../../core/audit.service.js";
import { Clock } from "../../core/clock.js";
import { AppError, illegalTransition, notFound, versionConflict } from "../../core/errors.js";
import { EventBus, inTransaction } from "../../core/events.js";
import { NumberingService } from "../../core/numbering.service.js";
import { countAll, iso, likeKeyword, paginate } from "../../core/paging.js";
import { Scheduler } from "../../core/scheduler.js";
import { DB } from "../../core/tokens.js";
import { TodoService } from "../todo/todo.service.js";

type PurchaseRow = typeof purchaseOrders.$inferSelect;
type LineRow = typeof purchaseLines.$inferSelect;
type ReceiptRow = typeof purchaseReceipts.$inferSelect;

const DAY = 86_400_000;
const OPEN_STATUSES = ["ORDERED", "PARTIAL"];
export const YARN_GRAMS_PER_PAIR = 26.1;
export const DEFAULT_PAIRS_PER_CARTON = 120;
const REQUIREMENT_MATERIALS = { YARN: "Y-40S-T80C20", OPP_BAG: "P-OPP-BAG", CARTON: "P-CARTON-C" } as const;

const round3 = (n: number) => Math.round(n * 1000) / 1000;
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);
const overdueTodoPrefix = (purchaseId: string) => `purchase.overdue:${purchaseId}:`;

@Injectable()
export class PurchaseService implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly audit: AuditService,
    private readonly numbering: NumberingService,
    private readonly events: EventBus,
    private readonly clock: Clock,
    private readonly scheduler: Scheduler,
    private readonly todos: TodoService,
  ) {}

  onModuleInit(): void {
    this.scheduler.register({ name: "purchase.overdue", dailyAt: "00:40", run: () => this.scanOverdue() });
  }

  async list(ctx: AccessContext, q: z.infer<typeof purchaseListQuerySchema>): Promise<Page<PurchaseDto>> {
    const conds: SQL[] = [scoped(purchaseOrders, ctx)];
    if (q.status?.length) conds.push(inArray(purchaseOrders.status, q.status));
    if (q.category?.length) conds.push(inArray(purchaseOrders.category, q.category));
    if (q.customerId) conds.push(eq(purchaseOrders.customerId, q.customerId));
    if (q.orderId) conds.push(eq(purchaseOrders.orderId, q.orderId));
    if (q.overdue === true) conds.push(inArray(purchaseOrders.status, OPEN_STATUSES), isNotNull(purchaseOrders.promisedDate), lt(purchaseOrders.promisedDate, this.clock.today()));
    const kw = likeKeyword(q.keyword);
    if (kw) {
      const poIds = this.db.select({ id: customerOrders.id }).from(customerOrders).where(ilike(customerOrders.poNo, kw));
      conds.push(or(ilike(purchaseOrders.docNo, kw), ilike(purchaseOrders.supplier, kw), inArray(purchaseOrders.orderId, poIds))!);
    }
    const where = and(...conds);
    return paginate(
      q,
      async () => (await this.db.select({ n: countAll }).from(purchaseOrders).where(where))[0]!.n,
      async (limit, offset) => this.toDtos(await this.db.select().from(purchaseOrders).where(where).orderBy(desc(purchaseOrders.orderedAt), desc(purchaseOrders.docNo)).limit(limit).offset(offset)),
    );
  }

  async get(ctx: AccessContext, id: string): Promise<PurchaseDetailDto> {
    const row = assertCanSee(ctx, (await this.db.select().from(purchaseOrders).where(eq(purchaseOrders.id, id)))[0]);
    const dto = (await this.toDtos([row]))[0]!;
    const lines = await this.db.select().from(purchaseLines).where(eq(purchaseLines.purchaseId, id)).orderBy(asc(purchaseLines.sort), asc(purchaseLines.id));
    const receipts = await this.db.select().from(purchaseReceipts).where(eq(purchaseReceipts.purchaseId, id)).orderBy(asc(purchaseReceipts.createdAt));
    return { ...dto, lines: await this.toLineDtos(lines), receipts: await this.toReceiptDtos(receipts) };
  }

  async create(ctx: AccessContext, input: z.infer<typeof purchaseCreateSchema>): Promise<PurchaseDetailDto> {
    const row = await inTransaction(this.db, this.events, async (tx, emit) => {
      const customerId = await this.resolveCustomer(ctx, tx, input);
      const mats = await this.materialsById(tx, input.lines.map((l) => l.materialId).filter((x): x is string => !!x));
      const lines = input.lines.map((l, i) => {
        const mat = l.materialId ? mats.get(l.materialId) : undefined;
        if (l.materialId && !mat) throw notFound("material");
        const name = l.name?.trim() || mat?.name;
        const unit = l.unit?.trim() || mat?.unit;
        if (!name || !unit) throw new AppError(purchaseErrors.PURCHASE_LINE_NAME_REQUIRED, { index: i + 1 });
        return { materialId: l.materialId ?? null, name, spec: l.spec ?? mat?.spec ?? null, quantity: l.quantity, unit, unitPrice: l.unitPrice ?? mat?.unitPrice ?? null };
      });
      const docNo = await this.numbering.next("purchase", tx);
      const created = (
        await tx
          .insert(purchaseOrders)
          .values({
            docNo,
            orderId: input.orderId ?? null,
            sampleId: input.sampleId ?? null,
            supplier: input.supplier,
            category: input.category,
            status: "ORDERED",
            orderedAt: input.orderedAt ?? this.clock.today(),
            promisedDate: input.promisedDate,
            deliveryPlace: input.deliveryPlace ?? null,
            note: input.note ?? null,
            ...ownership(ctx, customerId),
            createdBy: ctx.userId,
          })
          .returning()
      )[0]!;
      await tx.insert(purchaseLines).values(lines.map((l, i) => ({ ...l, purchaseId: created.id, sort: i + 1 })));
      await this.audit.log(ctx, { action: "purchase.order.create", objectType: "purchase", objectId: created.id, docNo }, tx);
      emit({ type: "purchase.order.created", aggregateType: "purchase", aggregateId: created.id, payload: { docNo, orderId: created.orderId, category: created.category } });
      return created;
    });
    return this.get(ctx, row.id);
  }

  async receive(ctx: AccessContext, id: string, input: z.infer<typeof purchaseReceiveSchema>): Promise<PurchaseDetailDto> {
    await inTransaction(this.db, this.events, async (tx, emit) => {
      const before = assertCanSee(ctx, (await tx.select().from(purchaseOrders).where(eq(purchaseOrders.id, id)))[0]);
      if (before.version !== input.version) throw versionConflict();
      if (!OPEN_STATUSES.includes(before.status)) throw illegalTransition(before.status, "receive");
      const lines = await tx.select().from(purchaseLines).where(eq(purchaseLines.purchaseId, id));
      const receivedAt = input.receivedAt ?? this.clock.today();
      const merged = new Map<string, number>();
      for (const r of input.lines) merged.set(r.lineId, round3((merged.get(r.lineId) ?? 0) + r.quantity));
      const after = new Map(lines.map((l) => [l.id, l.receivedQty]));
      for (const [lineId, quantity] of merged) {
        const line = lines.find((l) => l.id === lineId);
        if (!line) throw new AppError(purchaseErrors.PURCHASE_LINE_NOT_FOUND);
        const remaining = round3(line.quantity - line.receivedQty);
        if (quantity > remaining) throw new AppError(purchaseErrors.PURCHASE_RECEIVE_EXCEEDS, { name: line.name, quantity, remaining });
        after.set(lineId, round3(line.receivedQty + quantity));
        await tx.update(purchaseLines).set({ receivedQty: round3(line.receivedQty + quantity) }).where(eq(purchaseLines.id, lineId));
        await tx.insert(purchaseReceipts).values({ purchaseId: id, lineId, quantity, receivedAt, qcResult: input.qcResult ?? null, note: input.note ?? null, createdBy: ctx.userId });
      }
      const complete = lines.every((l) => (after.get(l.id) ?? 0) >= l.quantity);
      const to = complete ? "RECEIVED" : "PARTIAL";
      if (to !== before.status && !canTransition("purchase", before.status as "ORDERED", to)) throw illegalTransition(before.status, "receive");
      const updated = (
        await tx
          .update(purchaseOrders)
          .set({ status: to, ...(complete ? { receivedAt } : {}), version: before.version + 1, updatedBy: ctx.userId })
          .where(and(eq(purchaseOrders.id, id), eq(purchaseOrders.version, input.version)))
          .returning()
      )[0];
      if (!updated) throw versionConflict();
      if (complete) await this.todos.closeByPrefix(overdueTodoPrefix(id), tx);
      await this.audit.log(ctx, { action: "purchase.receipt.create", objectType: "purchase", objectId: id, docNo: before.docNo, diff: { status: { from: before.status, to }, lines: Object.fromEntries(merged) } }, tx);
      emit({ type: complete ? "purchase.order.received" : "purchase.order.partiallyReceived", aggregateType: "purchase", aggregateId: id, payload: { docNo: before.docNo, orderId: before.orderId } });
    });
    return this.get(ctx, id);
  }

  async cancel(ctx: AccessContext, id: string, input: { version: number; reason?: string | null }): Promise<PurchaseDetailDto> {
    await inTransaction(this.db, this.events, async (tx, emit) => {
      const before = assertCanSee(ctx, (await tx.select().from(purchaseOrders).where(eq(purchaseOrders.id, id)))[0]);
      if (before.version !== input.version) throw versionConflict();
      if (!canTransition("purchase", before.status as "ORDERED", "CANCELLED")) throw illegalTransition(before.status, "cancel");
      const updated = (
        await tx
          .update(purchaseOrders)
          .set({ status: "CANCELLED", cancelledAt: this.clock.now(), cancelReason: input.reason ?? null, version: before.version + 1, updatedBy: ctx.userId })
          .where(and(eq(purchaseOrders.id, id), eq(purchaseOrders.version, input.version)))
          .returning()
      )[0];
      if (!updated) throw versionConflict();
      await this.todos.closeByPrefix(overdueTodoPrefix(id), tx);
      await this.audit.log(ctx, { action: "purchase.order.cancel", objectType: "purchase", objectId: id, docNo: before.docNo, diff: { status: { from: before.status, to: "CANCELLED" }, reason: input.reason ?? null } }, tx);
      emit({ type: "purchase.order.cancelled", aggregateType: "purchase", aggregateId: id, payload: { docNo: before.docNo, orderId: before.orderId } });
    });
    return this.get(ctx, id);
  }

  async listReceipts(ctx: AccessContext, q: z.infer<typeof purchaseReceiptListQuerySchema>): Promise<Page<PurchaseReceiptDto>> {
    const visible = this.db.select({ id: purchaseOrders.id }).from(purchaseOrders).where(scoped(purchaseOrders, ctx));
    const conds: SQL[] = [inArray(purchaseReceipts.purchaseId, visible)];
    if (q.purchaseId) conds.push(eq(purchaseReceipts.purchaseId, q.purchaseId));
    if (q.from) conds.push(gte(purchaseReceipts.receivedAt, q.from));
    if (q.to) conds.push(lte(purchaseReceipts.receivedAt, q.to));
    const kw = likeKeyword(q.keyword);
    if (kw) {
      const matched = this.db.select({ id: purchaseOrders.id }).from(purchaseOrders).where(or(ilike(purchaseOrders.docNo, kw), ilike(purchaseOrders.supplier, kw)));
      conds.push(inArray(purchaseReceipts.purchaseId, matched));
    }
    const where = and(...conds);
    return paginate(
      q,
      async () => (await this.db.select({ n: countAll }).from(purchaseReceipts).where(where))[0]!.n,
      async (limit, offset) => this.toReceiptDtos(await this.db.select().from(purchaseReceipts).where(where).orderBy(desc(purchaseReceipts.receivedAt), desc(purchaseReceipts.createdAt)).limit(limit).offset(offset)),
    );
  }

  async requirements(ctx: AccessContext, orderId: string): Promise<PurchaseRequirementDto> {
    const order = assertCanSee(ctx, (await this.db.select().from(customerOrders).where(eq(customerOrders.id, orderId)))[0]);
    const lines = (await this.db.select().from(orderLines).where(eq(orderLines.orderId, orderId))).filter((l) => l.quantity > 0);
    const totalPairs = lines.length ? lines.reduce((s, l) => s + l.quantity, 0) : order.totalPairs;
    const { pairsPerCarton, source } = await this.pairsPerCartonFor(orderId);
    const cartonsNeeded = lines.length ? lines.reduce((s, l) => s + Math.ceil(l.quantity / pairsPerCarton), 0) : Math.ceil(totalPairs / pairsPerCarton);
    const mats = await this.db.select().from(materials).where(inArray(materials.code, Object.values(REQUIREMENT_MATERIALS)));
    const mat = (key: keyof typeof REQUIREMENT_MATERIALS) => mats.find((m) => m.code === REQUIREMENT_MATERIALS[key]) ?? null;
    const purchases = await this.db.select().from(purchaseOrders).where(and(eq(purchaseOrders.orderId, orderId), ne(purchaseOrders.status, "CANCELLED")));
    const pLines = purchases.length ? await this.db.select().from(purchaseLines).where(inArray(purchaseLines.purchaseId, purchases.map((p) => p.id))) : [];
    const categoryOf = new Map(purchases.map((p) => [p.id, p.category]));
    const matches: Record<keyof typeof REQUIREMENT_MATERIALS, (l: LineRow) => boolean> = {
      YARN: (l) => (mat("YARN") !== null && l.materialId === mat("YARN")!.id) || (categoryOf.get(l.purchaseId) === "YARN" && l.unit.toLowerCase() === "kg"),
      OPP_BAG: (l) => (mat("OPP_BAG") !== null && l.materialId === mat("OPP_BAG")!.id) || (categoryOf.get(l.purchaseId) === "PACKAGING" && !l.materialId && l.name.includes("袋")),
      CARTON: (l) => (mat("CARTON") !== null && l.materialId === mat("CARTON")!.id) || (categoryOf.get(l.purchaseId) === "PACKAGING" && !l.materialId && l.name.includes("箱")),
    };
    const specs: { key: keyof typeof REQUIREMENT_MATERIALS; category: "YARN" | "PACKAGING"; name: string; unit: string; basis: string; required: number }[] = [
      { key: "YARN", category: "YARN", name: "纱线合计", unit: "kg", basis: `${YARN_GRAMS_PER_PAIR} g/双`, required: round3((totalPairs * YARN_GRAMS_PER_PAIR) / 1000) },
      { key: "OPP_BAG", category: "PACKAGING", name: mat("OPP_BAG")?.name ?? "OPP 袋", unit: mat("OPP_BAG")?.unit ?? "个", basis: "1 个/双", required: totalPairs },
      { key: "CARTON", category: "PACKAGING", name: mat("CARTON")?.name ?? "纸箱", unit: mat("CARTON")?.unit ?? "个", basis: `1 个/${pairsPerCarton} 双`, required: cartonsNeeded },
    ];
    return {
      orderId,
      poNo: order.poNo,
      totalPairs,
      pairsPerCarton,
      pairsPerCartonSource: source,
      items: specs.map((s) => {
        const matched = pLines.filter(matches[s.key]);
        const ordered = round3(matched.reduce((a, l) => a + l.quantity, 0));
        const received = round3(matched.reduce((a, l) => a + l.receivedQty, 0));
        const shortage = round3(Math.max(0, s.required - ordered));
        const m = mat(s.key);
        return { ...s, materialId: m?.id ?? null, materialCode: m?.code ?? null, ordered, received, shortage, suggestion: shortage > 0 ? `建议补采 ${shortage} ${s.unit}` : null };
      }),
    };
  }

  async listMaterials(): Promise<PurchaseMaterialDto[]> {
    const rows = await this.db.select().from(materials).where(isNull(materials.deletedAt)).orderBy(asc(materials.category), asc(materials.code));
    return rows.map((m) => ({ id: m.id, code: m.code, name: m.name, category: m.category, spec: m.spec, unit: m.unit, unitPrice: m.unitPrice, supplier: m.supplier }));
  }

  async scanOverdue(): Promise<number> {
    const today = this.clock.today();
    const rows = await this.db.select().from(purchaseOrders).where(and(inArray(purchaseOrders.status, OPEN_STATUSES), isNotNull(purchaseOrders.promisedDate), lt(purchaseOrders.promisedDate, today)));
    if (!rows.length) return 0;
    const buyers = (await this.db.select({ userId: userRoles.userId }).from(userRoles).innerJoin(roles, eq(roles.id, userRoles.roleId)).innerJoin(users, eq(users.id, userRoles.userId)).where(and(eq(roles.code, "R007"), eq(users.status, "ACTIVE")))).map((r) => r.userId);
    for (const r of rows) {
      const assignees = buyers.includes(r.ownerId) ? [r.ownerId] : buyers;
      const days = daysBetween(r.promisedDate!, today);
      for (const assigneeId of assignees) {
        await this.todos.upsert({
          fingerprint: `${overdueTodoPrefix(r.id)}${assigneeId}`,
          source: "FLOW",
          action: "purchase.order.chase",
          title: `采购逾期未到货 ${r.docNo}`,
          description: `${r.supplier} 承诺交期 ${r.promisedDate}，已逾期 ${days} 天`,
          docType: "purchase",
          docId: r.id,
          docNo: r.docNo,
          link: `/purchases/${r.id}`,
          customerId: r.customerId,
          assigneeId,
          dueAt: new Date(`${r.promisedDate}T00:00:00Z`),
        });
      }
    }
    await this.audit.log(systemContext(), { action: "purchase.order.overdueScan", diff: { count: rows.length } });
    return rows.length;
  }

  private async pairsPerCartonFor(orderId: string): Promise<{ pairsPerCarton: number; source: "PLAN" | "DEFAULT" }> {
    const plans = await this.db.select().from(packagingPlans).where(eq(packagingPlans.orderId, orderId)).orderBy(desc(packagingPlans.updatedAt));
    const effective = plans.find((p) => p.effectiveVersion !== null);
    if (effective) {
      const snap = (await this.db.select().from(packagingPlanVersions).where(and(eq(packagingPlanVersions.planId, effective.id), eq(packagingPlanVersions.versionNo, effective.effectiveVersion!))))[0]?.snapshot;
      const value = (snap?.pairsPerCarton as number | null | undefined) ?? effective.pairsPerCarton;
      if (value) return { pairsPerCarton: value, source: "PLAN" };
    }
    const any = plans.find((p) => p.pairsPerCarton);
    return any?.pairsPerCarton ? { pairsPerCarton: any.pairsPerCarton, source: "PLAN" } : { pairsPerCarton: DEFAULT_PAIRS_PER_CARTON, source: "DEFAULT" };
  }

  private async resolveCustomer(ctx: AccessContext, tx: DbOrTx, input: { orderId?: string | null; sampleId?: string | null; customerId?: string | null }): Promise<string> {
    let customerId: string | null = null;
    if (input.orderId) {
      customerId = assertCanSee(ctx, (await tx.select().from(customerOrders).where(eq(customerOrders.id, input.orderId)))[0]).customerId;
    }
    if (input.sampleId) {
      const sample = assertCanSee(ctx, (await tx.select().from(samples).where(eq(samples.id, input.sampleId)))[0]);
      if (customerId && sample.customerId !== customerId) throw notFound();
      customerId = sample.customerId;
    }
    customerId ??= input.customerId ?? null;
    if (!customerId) throw new AppError(purchaseErrors.PURCHASE_SOURCE_REQUIRED);
    if (!canSeeCustomer(ctx, customerId)) throw notFound();
    return customerId;
  }

  private async materialsById(tx: DbOrTx, ids: string[]) {
    if (!ids.length) return new Map<string, typeof materials.$inferSelect>();
    return new Map((await tx.select().from(materials).where(inArray(materials.id, ids))).map((m) => [m.id, m]));
  }

  private async toDtos(rows: PurchaseRow[]): Promise<PurchaseDto[]> {
    if (!rows.length) return [];
    const ids = rows.map((r) => r.id);
    const custs = await this.db.select({ id: customers.id, name: customers.name }).from(customers).where(inArray(customers.id, [...new Set(rows.map((r) => r.customerId))]));
    const owners = await this.db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, [...new Set(rows.map((r) => r.ownerId))]));
    const orderIds = [...new Set(rows.map((r) => r.orderId).filter((x): x is string => !!x))];
    const orders = orderIds.length ? await this.db.select({ id: customerOrders.id, poNo: customerOrders.poNo }).from(customerOrders).where(inArray(customerOrders.id, orderIds)) : [];
    const sampleIds = [...new Set(rows.map((r) => r.sampleId).filter((x): x is string => !!x))];
    const sampleRows = sampleIds.length ? await this.db.select({ id: samples.id, docNo: samples.docNo }).from(samples).where(inArray(samples.id, sampleIds)) : [];
    const lines = await this.db.select().from(purchaseLines).where(inArray(purchaseLines.purchaseId, ids));
    const today = this.clock.today();
    return rows.map((r) => {
      const own = lines.filter((l) => l.purchaseId === r.id);
      const qty = own.reduce((s, l) => s + l.quantity, 0);
      const got = own.reduce((s, l) => s + Math.min(l.receivedQty, l.quantity), 0);
      const overdue = OPEN_STATUSES.includes(r.status) && !!r.promisedDate && r.promisedDate < today;
      return {
        id: r.id,
        docNo: r.docNo,
        orderId: r.orderId,
        poNo: orders.find((o) => o.id === r.orderId)?.poNo ?? null,
        sampleId: r.sampleId,
        sampleNo: sampleRows.find((s) => s.id === r.sampleId)?.docNo ?? null,
        customerId: r.customerId,
        customerName: custs.find((c) => c.id === r.customerId)?.name ?? "",
        supplier: r.supplier,
        category: r.category as PurchaseDto["category"],
        status: r.status as PurchaseDto["status"],
        orderedAt: r.orderedAt,
        promisedDate: r.promisedDate,
        receivedAt: r.receivedAt,
        deliveryPlace: r.deliveryPlace,
        note: r.note,
        overdue,
        overdueDays: overdue ? daysBetween(r.promisedDate!, today) : 0,
        lineCount: own.length,
        amount: Math.round(own.reduce((s, l) => s + l.quantity * (l.unitPrice ?? 0), 0) * 100) / 100,
        receivedRate: qty > 0 ? Math.round((got / qty) * 10000) / 10000 : 0,
        cancelledAt: iso(r.cancelledAt),
        cancelReason: r.cancelReason,
        ownerId: r.ownerId,
        ownerName: owners.find((o) => o.id === r.ownerId)?.name ?? "",
        createdAt: r.createdAt.toISOString(),
        version: r.version,
      };
    });
  }

  private async toLineDtos(rows: LineRow[]): Promise<PurchaseDetailDto["lines"]> {
    const matIds = [...new Set(rows.map((r) => r.materialId).filter((x): x is string => !!x))];
    const mats = matIds.length ? await this.db.select({ id: materials.id, code: materials.code }).from(materials).where(inArray(materials.id, matIds)) : [];
    return rows.map((r) => ({
      id: r.id,
      materialId: r.materialId,
      materialCode: mats.find((m) => m.id === r.materialId)?.code ?? null,
      name: r.name,
      spec: r.spec,
      quantity: r.quantity,
      unit: r.unit,
      unitPrice: r.unitPrice,
      receivedQty: r.receivedQty,
      remainingQty: round3(Math.max(0, r.quantity - r.receivedQty)),
    }));
  }

  private async toReceiptDtos(rows: ReceiptRow[]): Promise<PurchaseReceiptDto[]> {
    if (!rows.length) return [];
    const purchases = await this.db.select({ id: purchaseOrders.id, docNo: purchaseOrders.docNo, supplier: purchaseOrders.supplier }).from(purchaseOrders).where(inArray(purchaseOrders.id, [...new Set(rows.map((r) => r.purchaseId))]));
    const lines = await this.db.select({ id: purchaseLines.id, name: purchaseLines.name, unit: purchaseLines.unit }).from(purchaseLines).where(inArray(purchaseLines.id, [...new Set(rows.map((r) => r.lineId))]));
    const creatorIds = [...new Set(rows.map((r) => r.createdBy).filter((x): x is string => !!x))];
    const people = creatorIds.length ? await this.db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, creatorIds)) : [];
    return rows.map((r) => {
      const p = purchases.find((x) => x.id === r.purchaseId);
      const l = lines.find((x) => x.id === r.lineId);
      return {
        id: r.id,
        purchaseId: r.purchaseId,
        purchaseDocNo: p?.docNo ?? "",
        supplier: p?.supplier ?? "",
        lineId: r.lineId,
        lineName: l?.name ?? "",
        quantity: r.quantity,
        unit: l?.unit ?? "",
        receivedAt: r.receivedAt,
        qcResult: r.qcResult as PurchaseReceiptDto["qcResult"],
        note: r.note,
        createdByName: people.find((x) => x.id === r.createdBy)?.name ?? null,
        createdAt: r.createdAt.toISOString(),
      };
    });
  }
}
