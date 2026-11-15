import { Inject, Injectable, type OnModuleInit } from "@nestjs/common";
import type { Page } from "@otd/contracts/common";
import {
  type CartonCoverageDto,
  type CartonDto,
  PACKAGING_PLAN_FIELDS,
  type PackagingPlanDetailDto,
  type PackagingPlanDto,
  type PackagingPlanField,
  type PackagingVersionDiffDto,
  type PackagingVersionDto,
  type cartonAdjustSchema,
  type cartonGenerateSchema,
  type cartonListQuerySchema,
  type packagingConfirmSchema,
  type packagingPlanCreateSchema,
  type packagingPlanFieldsSchema,
  type packagingPlanListQuerySchema,
  type packagingPlanUpdateSchema,
  packagingErrors,
} from "@otd/contracts/packaging";
import { type Database, type DbOrTx, cartons, customerOrders, customers, orderLines, packagingPlanVersions, packagingPlans, styles, systemParams, users } from "@otd/db";
import { canTransition } from "@otd/shared";
import { type SQL, and, asc, desc, eq, ilike, inArray, isNotNull, lte, or } from "drizzle-orm";
import type { z } from "zod";
import { type AccessContext, canSeeCustomer, systemContext } from "../../core/access/access.types.js";
import { assertCanSee, ownership, scoped } from "../../core/access/scope.js";
import { AuditService, diffOf } from "../../core/audit.service.js";
import { Clock } from "../../core/clock.js";
import { AppError, assertFound, illegalTransition, notFound, versionConflict } from "../../core/errors.js";
import { EventBus, inTransaction } from "../../core/events.js";
import { NumberingService } from "../../core/numbering.service.js";
import { countAll, iso, likeKeyword, paginate } from "../../core/paging.js";
import { Scheduler } from "../../core/scheduler.js";
import { DB } from "../../core/tokens.js";
import { TodoService } from "../todo/todo.service.js";

type PlanRow = typeof packagingPlans.$inferSelect;
type VersionRow = typeof packagingPlanVersions.$inferSelect;
type CartonRow = typeof cartons.$inferSelect;
type OrderRow = typeof customerOrders.$inferSelect;
type PlanFields = z.infer<typeof packagingPlanFieldsSchema>;

const DAY = 86_400_000;
const DEFAULT_PENDING_DAYS = 5;

export function planSnapshot(row: Pick<PlanRow, PackagingPlanField>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of PACKAGING_PLAN_FIELDS) out[f] = row[f] ?? null;
  return out;
}

function pickFields(input: PlanFields): Partial<Pick<PlanRow, PackagingPlanField>> {
  const out: Record<string, unknown> = {};
  for (const f of PACKAGING_PLAN_FIELDS) if (input[f] !== undefined) out[f] = input[f];
  return out as Partial<Pick<PlanRow, PackagingPlanField>>;
}

const confirmTodoPrefix = (planId: string) => `packaging.confirm:${planId}:`;

const SIZE_ORDER = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL"];

function sizeRank(size: string | null): [number, string] {
  const s = (size ?? "").trim().toUpperCase();
  const i = SIZE_ORDER.indexOf(s);
  if (i >= 0) return [i, s];
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? [100 + n, s] : [10_000, s];
}

type LineRow = typeof orderLines.$inferSelect;

export function sortOrderLines(lines: LineRow[], styleNo: Map<string, string>): LineRow[] {
  return [...lines].sort((a, b) => {
    const sa = styleNo.get(a.styleId) ?? a.styleId;
    const sb = styleNo.get(b.styleId) ?? b.styleId;
    if (sa !== sb) return sa < sb ? -1 : 1;
    if ((a.color ?? "") !== (b.color ?? "")) return (a.color ?? "") < (b.color ?? "") ? -1 : 1;
    const [ra, ta] = sizeRank(a.size);
    const [rb, tb] = sizeRank(b.size);
    if (ra !== rb) return ra - rb;
    if (ta !== tb) return ta < tb ? -1 : 1;
    return (a.sku ?? "") < (b.sku ?? "") ? -1 : (a.sku ?? "") > (b.sku ?? "") ? 1 : 0;
  });
}

@Injectable()
export class PackagingService implements OnModuleInit {
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
    this.scheduler.register({ name: "packaging.pending-customer", dailyAt: "08:00", run: () => this.remindPendingCustomer() });
  }

  async listPlans(ctx: AccessContext, q: z.infer<typeof packagingPlanListQuerySchema>): Promise<Page<PackagingPlanDto>> {
    const conds: SQL[] = [scoped(packagingPlans, ctx)];
    if (q.status?.length) conds.push(inArray(packagingPlans.status, q.status));
    if (q.customerId) conds.push(eq(packagingPlans.customerId, q.customerId));
    if (q.orderId) conds.push(eq(packagingPlans.orderId, q.orderId));
    const kw = likeKeyword(q.keyword);
    if (kw) {
      const poIds = this.db.select({ id: customerOrders.id }).from(customerOrders).where(ilike(customerOrders.poNo, kw));
      conds.push(or(ilike(packagingPlans.docNo, kw), ilike(packagingPlans.title, kw), ilike(packagingPlans.method, kw), inArray(packagingPlans.orderId, poIds))!);
    }
    const where = and(...conds);
    return paginate(
      q,
      async () => (await this.db.select({ n: countAll }).from(packagingPlans).where(where))[0]!.n,
      async (limit, offset) => this.toPlanDtos(await this.db.select().from(packagingPlans).where(where).orderBy(desc(packagingPlans.updatedAt)).limit(limit).offset(offset)),
    );
  }

  async getPlan(ctx: AccessContext, id: string): Promise<PackagingPlanDetailDto> {
    const row = assertCanSee(ctx, (await this.db.select().from(packagingPlans).where(eq(packagingPlans.id, id)))[0]);
    const dto = (await this.toPlanDtos([row]))[0]!;
    const versions = await this.db.select().from(packagingPlanVersions).where(eq(packagingPlanVersions.planId, id)).orderBy(asc(packagingPlanVersions.versionNo));
    return { ...dto, versions: await this.toVersionDtos(row, versions) };
  }

  async createPlan(ctx: AccessContext, input: z.infer<typeof packagingPlanCreateSchema>): Promise<PackagingPlanDetailDto> {
    const row = await inTransaction(this.db, this.events, async (tx, emit) => {
      const owner = await this.resolveOwnership(ctx, tx, input.orderId ?? null, input.customerId ?? null);
      if (input.styleId) await this.assertStyle(ctx, tx, input.styleId, owner.customerId);
      const docNo = await this.numbering.next("packaging", tx);
      const fields = pickFields(input);
      const created = (
        await tx
          .insert(packagingPlans)
          .values({ ...fields, docNo, title: input.title ?? input.method ?? docNo, requirements: input.requirements ?? [], orderId: input.orderId ?? null, styleId: input.styleId ?? null, currentVersion: 1, status: "DRAFT", ...owner, createdBy: ctx.userId })
          .returning()
      )[0]!;
      await tx.insert(packagingPlanVersions).values({ planId: created.id, versionNo: 1, snapshot: planSnapshot(created), changedBy: ctx.userId, changedAt: this.clock.now() });
      await this.audit.log(ctx, { action: "packaging.plan.create", objectType: "packagingPlan", objectId: created.id, docNo }, tx);
      emit({ type: "packaging.plan.created", aggregateType: "packagingPlan", aggregateId: created.id, payload: { docNo, orderId: created.orderId } });
      return created;
    });
    return this.getPlan(ctx, row.id);
  }

  async updatePlan(ctx: AccessContext, id: string, input: z.infer<typeof packagingPlanUpdateSchema>): Promise<PackagingPlanDetailDto> {
    const { version, changeNote, styleId, ...rest } = input;
    await inTransaction(this.db, this.events, async (tx, emit) => {
      const before = assertCanSee(ctx, (await tx.select().from(packagingPlans).where(eq(packagingPlans.id, id)))[0]);
      if (before.version !== version) throw versionConflict();
      if (before.status === "PENDING_CUSTOMER") throw new AppError(packagingErrors.PACKAGING_NOT_EDITABLE, { status: before.status });
      if (styleId) await this.assertStyle(ctx, tx, styleId, before.customerId);
      const revising = before.status === "CONFIRMED";
      if (revising && !canTransition("packagingPlan", "CONFIRMED", "DRAFT")) throw illegalTransition(before.status, "revise");
      const note = changeNote?.trim() || null;
      if (revising && !note) throw new AppError(packagingErrors.PACKAGING_CHANGE_NOTE_REQUIRED);
      const patch: Partial<PlanRow> = { ...pickFields(rest), ...(styleId !== undefined ? { styleId } : {}) };
      const nextVersion = revising ? before.currentVersion + 1 : before.currentVersion;
      const updated = (
        await tx
          .update(packagingPlans)
          .set({ ...patch, ...(revising ? { status: "DRAFT", currentVersion: nextVersion, submittedAt: null } : {}), version: before.version + 1, updatedBy: ctx.userId })
          .where(and(eq(packagingPlans.id, id), eq(packagingPlans.version, version)))
          .returning()
      )[0];
      if (!updated) throw versionConflict();
      const now = this.clock.now();
      if (revising) {
        await tx.insert(packagingPlanVersions).values({ planId: id, versionNo: nextVersion, snapshot: planSnapshot(updated), changeNote: note, changedBy: ctx.userId, changedAt: now });
      } else {
        await tx
          .update(packagingPlanVersions)
          .set({ snapshot: planSnapshot(updated), ...(note ? { changeNote: note } : {}), changedBy: ctx.userId, changedAt: now })
          .where(and(eq(packagingPlanVersions.planId, id), eq(packagingPlanVersions.versionNo, nextVersion)));
      }
      const diff = diffOf(before as unknown as Record<string, unknown>, patch as Record<string, unknown>);
      await this.audit.log(ctx, { action: revising ? "packaging.plan.revise" : "packaging.plan.update", objectType: "packagingPlan", objectId: id, docNo: before.docNo, diff: { ...diff, ...(revising ? { versionNo: { from: before.currentVersion, to: nextVersion } } : {}) } }, tx);
      if (revising) emit({ type: "packaging.plan.revised", aggregateType: "packagingPlan", aggregateId: id, payload: { docNo: before.docNo, orderId: before.orderId, versionNo: nextVersion } });
    });
    return this.getPlan(ctx, id);
  }

  async submitPlan(ctx: AccessContext, id: string, version: number): Promise<PackagingPlanDetailDto> {
    await inTransaction(this.db, this.events, async (tx, emit) => {
      const before = await this.lockPlan(ctx, tx, id, version);
      if (!canTransition("packagingPlan", before.status as "DRAFT", "PENDING_CUSTOMER")) throw illegalTransition(before.status, "submit");
      if (!before.pairsPerCarton) throw new AppError(packagingErrors.PACKAGING_PAIRS_PER_CARTON_REQUIRED);
      await this.writePlan(tx, before, { status: "PENDING_CUSTOMER", submittedAt: this.clock.now() }, ctx.userId);
      await this.audit.log(ctx, { action: "packaging.plan.submit", objectType: "packagingPlan", objectId: id, docNo: before.docNo, diff: { status: { from: before.status, to: "PENDING_CUSTOMER" } } }, tx);
      emit({ type: "packaging.plan.submitted", aggregateType: "packagingPlan", aggregateId: id, payload: { docNo: before.docNo, orderId: before.orderId, versionNo: before.currentVersion } });
    });
    return this.getPlan(ctx, id);
  }

  async returnPlan(ctx: AccessContext, id: string, input: { version: number; reason?: string | null }): Promise<PackagingPlanDetailDto> {
    await inTransaction(this.db, this.events, async (tx, emit) => {
      const before = await this.lockPlan(ctx, tx, id, input.version);
      if (!canTransition("packagingPlan", before.status as "PENDING_CUSTOMER", "DRAFT")) throw illegalTransition(before.status, "return");
      await this.writePlan(tx, before, { status: "DRAFT", submittedAt: null }, ctx.userId);
      await this.todos.closeByPrefix(confirmTodoPrefix(id), tx);
      await this.audit.log(ctx, { action: "packaging.plan.return", objectType: "packagingPlan", objectId: id, docNo: before.docNo, diff: { status: { from: before.status, to: "DRAFT" }, reason: input.reason ?? null } }, tx);
      emit({ type: "packaging.plan.returned", aggregateType: "packagingPlan", aggregateId: id, payload: { docNo: before.docNo, orderId: before.orderId } });
    });
    return this.getPlan(ctx, id);
  }

  async confirmPlan(ctx: AccessContext, id: string, input: z.infer<typeof packagingConfirmSchema>): Promise<PackagingPlanDetailDto> {
    await inTransaction(this.db, this.events, async (tx, emit) => {
      const before = await this.lockPlan(ctx, tx, id, input.version);
      if (!canTransition("packagingPlan", before.status as "PENDING_CUSTOMER", "CONFIRMED")) throw illegalTransition(before.status, "confirm");
      const confirmedAt = input.confirmedAt ? new Date(input.confirmedAt) : this.clock.now();
      await this.writePlan(tx, before, { status: "CONFIRMED", confirmedAt, confirmedBy: input.confirmedBy, confirmMethod: input.method, confirmNote: input.note ?? null, effectiveVersion: before.currentVersion }, ctx.userId);
      await tx
        .update(packagingPlanVersions)
        .set({ customerConfirmed: true, confirmedAt, confirmedBy: input.confirmedBy, confirmMethod: input.method })
        .where(and(eq(packagingPlanVersions.planId, id), eq(packagingPlanVersions.versionNo, before.currentVersion)));
      await this.todos.closeByPrefix(confirmTodoPrefix(id), tx);
      await this.audit.log(ctx, { action: "packaging.plan.confirm", objectType: "packagingPlan", objectId: id, docNo: before.docNo, diff: { status: { from: before.status, to: "CONFIRMED" }, versionNo: before.currentVersion, confirmedBy: input.confirmedBy, method: input.method } }, tx);
      emit({ type: "packaging.plan.confirmed", aggregateType: "packagingPlan", aggregateId: id, payload: { docNo: before.docNo, orderId: before.orderId, versionNo: before.currentVersion } });
    });
    return this.getPlan(ctx, id);
  }

  async compareVersions(ctx: AccessContext, id: string, from: number, to: number): Promise<PackagingVersionDiffDto> {
    const plan = assertCanSee(ctx, (await this.db.select().from(packagingPlans).where(eq(packagingPlans.id, id)))[0]);
    const rows = await this.db.select().from(packagingPlanVersions).where(and(eq(packagingPlanVersions.planId, id), inArray(packagingPlanVersions.versionNo, [from, to])));
    const a = rows.find((r) => r.versionNo === from);
    const b = rows.find((r) => r.versionNo === to);
    if (!a) throw new AppError(packagingErrors.PACKAGING_VERSION_NOT_FOUND, { versionNo: from });
    if (!b) throw new AppError(packagingErrors.PACKAGING_VERSION_NOT_FOUND, { versionNo: to });
    const diffs = PACKAGING_PLAN_FIELDS.filter((f) => JSON.stringify(a.snapshot[f] ?? null) !== JSON.stringify(b.snapshot[f] ?? null)).map((f) => ({ field: f, from: a.snapshot[f] ?? null, to: b.snapshot[f] ?? null }));
    return { planId: id, docNo: plan.docNo, from, to, diffs };
  }

  async remindPendingCustomer(): Promise<number> {
    const days = await this.pendingDays();
    const now = this.clock.now();
    const rows = await this.db
      .select()
      .from(packagingPlans)
      .where(and(eq(packagingPlans.status, "PENDING_CUSTOMER"), isNotNull(packagingPlans.submittedAt), lte(packagingPlans.submittedAt, new Date(now.getTime() - days * DAY))));
    for (const r of rows) {
      const waited = Math.floor((now.getTime() - r.submittedAt!.getTime()) / DAY);
      await this.todos.upsert({
        fingerprint: `${confirmTodoPrefix(r.id)}v${r.currentVersion}`,
        source: "FLOW",
        action: "packaging.plan.chase",
        title: `催客户确认包装方案 ${r.docNo} v${r.currentVersion}`,
        description: `已等待客户确认 ${waited} 天`,
        docType: "packagingPlan",
        docId: r.id,
        docNo: r.docNo,
        link: `/packaging/${r.id}`,
        customerId: r.customerId,
        assigneeId: r.ownerId,
        dueAt: new Date(r.submittedAt!.getTime() + days * DAY),
      });
    }
    if (rows.length) await this.audit.log(systemContext(), { action: "packaging.plan.remind", diff: { count: rows.length } });
    return rows.length;
  }

  async listCartons(ctx: AccessContext, q: z.infer<typeof cartonListQuerySchema>): Promise<Page<CartonDto>> {
    const conds: SQL[] = [scoped(cartons, ctx)];
    if (q.status?.length) conds.push(inArray(cartons.status, q.status));
    if (q.customerId) conds.push(eq(cartons.customerId, q.customerId));
    if (q.orderId) conds.push(eq(cartons.orderId, q.orderId));
    const kw = likeKeyword(q.keyword);
    if (kw) {
      const poIds = this.db.select({ id: customerOrders.id }).from(customerOrders).where(ilike(customerOrders.poNo, kw));
      const styleIds = this.db.select({ id: styles.id }).from(styles).where(ilike(styles.styleNo, kw));
      conds.push(or(ilike(cartons.docNo, kw), ilike(cartons.customerSku, kw), inArray(cartons.orderId, poIds), inArray(cartons.styleId, styleIds))!);
    }
    const where = and(...conds);
    return paginate(
      q,
      async () => (await this.db.select({ n: countAll }).from(cartons).where(where))[0]!.n,
      async (limit, offset) => this.toCartonDtos(await this.db.select().from(cartons).where(where).orderBy(desc(cartons.createdAt), asc(cartons.orderId), asc(cartons.rangeStart)).limit(limit).offset(offset)),
    );
  }

  async getCarton(ctx: AccessContext, id: string): Promise<CartonDto> {
    const row = assertCanSee(ctx, (await this.db.select().from(cartons).where(eq(cartons.id, id)))[0]);
    return (await this.toCartonDtos([row]))[0]!;
  }

  async generateCartons(ctx: AccessContext, input: z.infer<typeof cartonGenerateSchema>): Promise<CartonDto[]> {
    const created = await inTransaction(this.db, this.events, async (tx, emit) => {
      const order = assertCanSee(ctx, (await tx.select().from(customerOrders).where(eq(customerOrders.id, input.orderId)))[0]);
      const plan = await this.effectivePlanFor(tx, order, input.planId);
      const snapshot = (await tx.select().from(packagingPlanVersions).where(and(eq(packagingPlanVersions.planId, plan.id), eq(packagingPlanVersions.versionNo, plan.effectiveVersion!))))[0]?.snapshot;
      const perCarton = input.pairsPerCarton ?? (snapshot?.pairsPerCarton as number | null | undefined) ?? plan.pairsPerCarton;
      if (!perCarton) throw new AppError(packagingErrors.PACKAGING_PAIRS_PER_CARTON_REQUIRED);
      const rawLines = (await tx.select().from(orderLines).where(eq(orderLines.orderId, order.id))).filter((l) => l.quantity > 0);
      if (!rawLines.length) throw new AppError(packagingErrors.PACKAGING_ORDER_HAS_NO_LINES, { poNo: order.poNo });
      const lineStyles = await tx.select({ id: styles.id, styleNo: styles.styleNo }).from(styles).where(inArray(styles.id, [...new Set(rawLines.map((l) => l.styleId))]));
      const lines = sortOrderLines(rawLines, new Map(lineStyles.map((x) => [x.id, x.styleNo])));
      const existing = await tx.select().from(cartons).where(eq(cartons.orderId, order.id));
      const covered = new Set(existing.map((c) => c.orderLineId).filter((x): x is string => !!x));
      let next = existing.reduce((m, c) => Math.max(m, c.rangeEnd ?? 0), 0) + 1;
      const packDueDate = input.packDueDate !== undefined ? input.packDueDate : (order.factoryReplyDate ?? order.customerDueDate);
      const rows: CartonRow[] = [];
      for (const line of lines) {
        if (covered.has(line.id)) continue;
        const count = Math.ceil(line.quantity / perCarton);
        const start = next;
        const end = next + count - 1;
        next = end + 1;
        const docNo = await this.numbering.next("carton", tx);
        const row = (
          await tx
            .insert(cartons)
            .values({
              docNo,
              orderId: order.id,
              orderLineId: line.id,
              styleId: line.styleId,
              customerSku: line.sku,
              color: line.color,
              size: line.size,
              pairs: line.quantity,
              pairsPerCarton: perCarton,
              cartonCount: count,
              rangeStart: start,
              rangeEnd: end,
              cartonRange: `${start}–${end}`,
              packDueDate,
              status: "TO_PACK",
              planId: plan.id,
              planVersion: plan.effectiveVersion,
              ownerId: order.ownerId,
              orgId: order.orgId,
              customerId: order.customerId,
              createdBy: ctx.userId,
            })
            .returning()
        )[0]!;
        rows.push(row);
      }
      if (rows.length) {
        await this.audit.log(ctx, { action: "packaging.carton.generate", objectType: "customerOrder", objectId: order.id, docNo: order.poNo, diff: { cartons: rows.map((r) => r.docNo), planVersion: plan.effectiveVersion } }, tx);
        for (const r of rows) emit({ type: "packaging.carton.generated", aggregateType: "carton", aggregateId: r.id, payload: { docNo: r.docNo, orderId: order.id, poNo: order.poNo } });
      }
      return rows;
    });
    return this.toCartonDtos(created);
  }

  async adjustCarton(ctx: AccessContext, id: string, input: z.infer<typeof cartonAdjustSchema>): Promise<CartonDto> {
    await inTransaction(this.db, this.events, async (tx) => {
      const before = assertCanSee(ctx, (await tx.select().from(cartons).where(eq(cartons.id, id)))[0]);
      if (before.version !== input.version) throw versionConflict();
      if (before.status !== "TO_PACK") throw new AppError(packagingErrors.PACKAGING_CARTON_NOT_EDITABLE, { status: before.status });
      const perCarton = input.pairsPerCarton ?? before.pairsPerCarton;
      const patch: Partial<CartonRow> = { pairsPerCarton: perCarton, cartonCount: Math.ceil(before.pairs / perCarton), ...(input.packDueDate !== undefined ? { packDueDate: input.packDueDate } : {}) };
      const updated = (await tx.update(cartons).set({ ...patch, version: before.version + 1, updatedBy: ctx.userId }).where(and(eq(cartons.id, id), eq(cartons.version, input.version))).returning())[0];
      if (!updated) throw versionConflict();
      if (updated.cartonCount !== before.cartonCount) await this.renumber(tx, before.orderId, ctx.userId);
      await this.audit.log(ctx, { action: "packaging.carton.adjust", objectType: "carton", objectId: id, docNo: before.docNo, diff: diffOf(before as unknown as Record<string, unknown>, patch as Record<string, unknown>) }, tx);
    });
    return this.getCarton(ctx, id);
  }

  async startCarton(ctx: AccessContext, id: string, version: number): Promise<CartonDto> {
    return this.cartonTransition(ctx, id, version, "PACKING", "start");
  }

  async finishCarton(ctx: AccessContext, id: string, version: number): Promise<CartonDto> {
    return this.cartonTransition(ctx, id, version, "PACKED", "finish");
  }

  async coverage(orderId: string, db: DbOrTx = this.db): Promise<CartonCoverageDto> {
    const lines = (await db.select().from(orderLines).where(eq(orderLines.orderId, orderId))).filter((l) => l.quantity > 0);
    const rows = await db.select().from(cartons).where(eq(cartons.orderId, orderId));
    const byLine = new Set(rows.map((c) => c.orderLineId).filter((x): x is string => !!x));
    const loose = rows.filter((c) => !c.orderLineId);
    const isCovered = (l: (typeof lines)[number]) => byLine.has(l.id) || loose.some((c) => c.styleId === l.styleId && c.customerSku === l.sku && c.size === l.size && (c.color ?? null) === (l.color ?? null) && c.pairs >= l.quantity);
    const missing = lines.filter((l) => !isCovered(l));
    const styleIds = [...new Set(missing.map((l) => l.styleId))];
    const styleRows = styleIds.length ? await db.select({ id: styles.id, styleNo: styles.styleNo }).from(styles).where(inArray(styles.id, styleIds)) : [];
    return {
      orderId,
      covered: lines.length > 0 && missing.length === 0,
      lineCount: lines.length,
      coveredLineCount: lines.length - missing.length,
      missing: missing.map((l) => ({ styleId: l.styleId, styleNo: styleRows.find((s) => s.id === l.styleId)?.styleNo ?? null, sku: l.sku, color: l.color, size: l.size, quantity: l.quantity })),
    };
  }

  async coverageFor(ctx: AccessContext, orderId: string): Promise<CartonCoverageDto> {
    assertCanSee(ctx, (await this.db.select().from(customerOrders).where(eq(customerOrders.id, orderId)))[0]);
    return this.coverage(orderId);
  }

  private async cartonTransition(ctx: AccessContext, id: string, version: number, to: "PACKING" | "PACKED", action: string): Promise<CartonDto> {
    await inTransaction(this.db, this.events, async (tx, emit) => {
      const before = assertCanSee(ctx, (await tx.select().from(cartons).where(eq(cartons.id, id)))[0]);
      if (before.version !== version) throw versionConflict();
      if (!canTransition("carton", before.status as "TO_PACK", to)) throw illegalTransition(before.status, action);
      const stamp = to === "PACKING" ? { startedAt: this.clock.now() } : { packedAt: this.clock.now() };
      const updated = (await tx.update(cartons).set({ ...stamp, status: to, version: before.version + 1, updatedBy: ctx.userId }).where(and(eq(cartons.id, id), eq(cartons.version, version))).returning())[0];
      if (!updated) throw versionConflict();
      await this.audit.log(ctx, { action: `packaging.carton.${action}`, objectType: "carton", objectId: id, docNo: before.docNo, diff: { status: { from: before.status, to } } }, tx);
      emit({ type: to === "PACKED" ? "packaging.carton.packed" : "packaging.carton.started", aggregateType: "carton", aggregateId: id, payload: { docNo: before.docNo, orderId: before.orderId } });
    });
    return this.getCarton(ctx, id);
  }

  private async renumber(tx: DbOrTx, orderId: string, userId: string): Promise<void> {
    const rows = await tx.select().from(cartons).where(eq(cartons.orderId, orderId)).orderBy(asc(cartons.rangeStart), asc(cartons.docNo));
    let next = 1;
    for (const r of rows) {
      const start = next;
      const end = next + r.cartonCount - 1;
      next = end + 1;
      if (r.rangeStart === start && r.rangeEnd === end) continue;
      await tx.update(cartons).set({ rangeStart: start, rangeEnd: end, cartonRange: `${start}–${end}`, version: r.version + 1, updatedBy: userId }).where(eq(cartons.id, r.id));
    }
  }

  private async effectivePlanFor(tx: DbOrTx, order: OrderRow, planId: string | undefined): Promise<PlanRow> {
    if (planId) {
      const plan = assertFound((await tx.select().from(packagingPlans).where(eq(packagingPlans.id, planId)))[0]);
      if (plan.orderId !== order.id) throw new AppError(packagingErrors.PACKAGING_PLAN_ORDER_MISMATCH, { docNo: plan.docNo });
      if (plan.effectiveVersion === null) throw new AppError(packagingErrors.PACKAGING_PLAN_REQUIRED, { poNo: order.poNo });
      return plan;
    }
    const plan = (await tx.select().from(packagingPlans).where(and(eq(packagingPlans.orderId, order.id), isNotNull(packagingPlans.effectiveVersion))).orderBy(desc(packagingPlans.confirmedAt)).limit(1))[0];
    if (!plan) throw new AppError(packagingErrors.PACKAGING_PLAN_REQUIRED, { poNo: order.poNo });
    return plan;
  }

  private async lockPlan(ctx: AccessContext, tx: DbOrTx, id: string, version: number): Promise<PlanRow> {
    const before = assertCanSee(ctx, (await tx.select().from(packagingPlans).where(eq(packagingPlans.id, id)))[0]);
    if (before.version !== version) throw versionConflict();
    return before;
  }

  private async writePlan(tx: DbOrTx, before: PlanRow, patch: Partial<PlanRow>, userId: string): Promise<PlanRow> {
    const updated = (await tx.update(packagingPlans).set({ ...patch, version: before.version + 1, updatedBy: userId }).where(and(eq(packagingPlans.id, before.id), eq(packagingPlans.version, before.version))).returning())[0];
    if (!updated) throw versionConflict();
    return updated;
  }

  private async resolveOwnership(ctx: AccessContext, tx: DbOrTx, orderId: string | null, customerId: string | null) {
    if (orderId) {
      const order = assertCanSee(ctx, (await tx.select().from(customerOrders).where(eq(customerOrders.id, orderId)))[0]);
      return { ownerId: order.ownerId, orgId: order.orgId, customerId: order.customerId };
    }
    if (!customerId) throw new AppError(packagingErrors.PACKAGING_SOURCE_REQUIRED);
    if (!canSeeCustomer(ctx, customerId)) throw notFound();
    return ownership(ctx, customerId);
  }

  private async assertStyle(ctx: AccessContext, tx: DbOrTx, styleId: string, customerId: string): Promise<void> {
    const style = (await tx.select().from(styles).where(eq(styles.id, styleId)))[0];
    if (!style || style.customerId !== customerId || !canSeeCustomer(ctx, style.customerId)) throw notFound();
  }

  private async pendingDays(): Promise<number> {
    const row = (await this.db.select().from(systemParams).where(eq(systemParams.key, "packaging.pendingCustomerDays")))[0];
    return typeof row?.value === "number" && row.value > 0 ? row.value : DEFAULT_PENDING_DAYS;
  }

  private async toPlanDtos(rows: PlanRow[]): Promise<PackagingPlanDto[]> {
    if (!rows.length) return [];
    const custs = await this.db.select({ id: customers.id, code: customers.code, name: customers.name }).from(customers).where(inArray(customers.id, [...new Set(rows.map((r) => r.customerId))]));
    const owners = await this.db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, [...new Set(rows.map((r) => r.ownerId))]));
    const orderIds = [...new Set(rows.map((r) => r.orderId).filter((x): x is string => !!x))];
    const orders = orderIds.length ? await this.db.select({ id: customerOrders.id, poNo: customerOrders.poNo }).from(customerOrders).where(inArray(customerOrders.id, orderIds)) : [];
    const styleIds = [...new Set(rows.map((r) => r.styleId).filter((x): x is string => !!x))];
    const styleRows = styleIds.length ? await this.db.select({ id: styles.id, styleNo: styles.styleNo }).from(styles).where(inArray(styles.id, styleIds)) : [];
    const cartonRows = await this.db.select({ planId: cartons.planId, pairs: cartons.pairs, cartonCount: cartons.cartonCount }).from(cartons).where(inArray(cartons.planId, rows.map((r) => r.id)));
    return rows.map((r) => {
      const own = cartonRows.filter((c) => c.planId === r.id);
      const cust = custs.find((c) => c.id === r.customerId);
      return {
        id: r.id,
        docNo: r.docNo,
        title: r.title,
        orderId: r.orderId,
        poNo: orders.find((o) => o.id === r.orderId)?.poNo ?? null,
        styleId: r.styleId,
        styleNo: styleRows.find((s) => s.id === r.styleId)?.styleNo ?? null,
        customerId: r.customerId,
        customerCode: cust?.code ?? "",
        customerName: cust?.name ?? "",
        status: r.status as PackagingPlanDto["status"],
        currentVersion: r.currentVersion,
        effectiveVersion: r.effectiveVersion,
        method: r.method,
        pairsPerCarton: r.pairsPerCarton,
        cartonSize: r.cartonSize,
        cartonType: r.cartonType,
        strength: r.strength,
        shippingMark: r.shippingMark,
        markPosition: r.markPosition,
        sizeSticker: r.sizeSticker,
        sealSticker: r.sealSticker,
        innerBag: r.innerBag,
        tape: r.tape,
        destination: r.destination,
        requirements: r.requirements,
        submittedAt: iso(r.submittedAt),
        confirmedAt: iso(r.confirmedAt),
        confirmedBy: r.confirmedBy,
        confirmMethod: r.confirmMethod as PackagingPlanDto["confirmMethod"],
        confirmNote: r.confirmNote,
        applicable: { cartonLines: own.length, pairs: own.reduce((s, c) => s + c.pairs, 0), cartons: own.reduce((s, c) => s + c.cartonCount, 0) },
        ownerId: r.ownerId,
        ownerName: owners.find((o) => o.id === r.ownerId)?.name ?? "",
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
        version: r.version,
      };
    });
  }

  private async toVersionDtos(plan: PlanRow, rows: VersionRow[]): Promise<PackagingVersionDto[]> {
    const ids = [...new Set(rows.map((r) => r.changedBy).filter((x): x is string => !!x))];
    const people = ids.length ? await this.db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, ids)) : [];
    return rows.map((r) => ({
      versionNo: r.versionNo,
      changeNote: r.changeNote,
      customerConfirmed: r.customerConfirmed,
      current: r.versionNo === plan.currentVersion,
      effective: r.versionNo === plan.effectiveVersion,
      changedBy: r.changedBy,
      changedByName: people.find((p) => p.id === r.changedBy)?.name ?? null,
      changedAt: r.changedAt.toISOString(),
      confirmedAt: iso(r.confirmedAt),
      confirmedBy: r.confirmedBy,
      confirmMethod: r.confirmMethod as PackagingVersionDto["confirmMethod"],
      snapshot: r.snapshot,
    }));
  }

  private async toCartonDtos(rows: CartonRow[]): Promise<CartonDto[]> {
    if (!rows.length) return [];
    const custs = await this.db.select({ id: customers.id, name: customers.name }).from(customers).where(inArray(customers.id, [...new Set(rows.map((r) => r.customerId))]));
    const orders = await this.db.select({ id: customerOrders.id, poNo: customerOrders.poNo }).from(customerOrders).where(inArray(customerOrders.id, [...new Set(rows.map((r) => r.orderId))]));
    const styleIds = [...new Set(rows.map((r) => r.styleId).filter((x): x is string => !!x))];
    const styleRows = styleIds.length ? await this.db.select({ id: styles.id, styleNo: styles.styleNo }).from(styles).where(inArray(styles.id, styleIds)) : [];
    const planIds = [...new Set(rows.map((r) => r.planId).filter((x): x is string => !!x))];
    const plans = planIds.length ? await this.db.select({ id: packagingPlans.id, docNo: packagingPlans.docNo }).from(packagingPlans).where(inArray(packagingPlans.id, planIds)) : [];
    return rows.map((r) => ({
      id: r.id,
      docNo: r.docNo,
      orderId: r.orderId,
      poNo: orders.find((o) => o.id === r.orderId)?.poNo ?? "",
      customerId: r.customerId,
      customerName: custs.find((c) => c.id === r.customerId)?.name ?? "",
      styleId: r.styleId,
      styleNo: styleRows.find((s) => s.id === r.styleId)?.styleNo ?? null,
      customerSku: r.customerSku,
      color: r.color,
      size: r.size,
      pairs: r.pairs,
      pairsPerCarton: r.pairsPerCarton,
      cartonCount: r.cartonCount,
      tailPairs: r.pairs % r.pairsPerCarton,
      cartonRange: r.cartonRange,
      rangeStart: r.rangeStart,
      rangeEnd: r.rangeEnd,
      packDueDate: r.packDueDate,
      status: r.status as CartonDto["status"],
      planId: r.planId,
      planDocNo: plans.find((p) => p.id === r.planId)?.docNo ?? null,
      planVersion: r.planVersion,
      startedAt: iso(r.startedAt),
      packedAt: iso(r.packedAt),
      createdAt: r.createdAt.toISOString(),
      version: r.version,
    }));
  }
}
