import { Inject, Injectable, type OnModuleInit } from "@nestjs/common";
import type { Page } from "@otd/contracts/common";
import {
  type InspectionDetailDto,
  type InspectionDto,
  type InspectionKpiDto,
  type InspectionLogDto,
  type InspectionScheduleViewDto,
  type ReleaseCheckDto,
  type ReleaseCheckItemDto,
  type inspectionCancelSchema,
  type inspectionCreateSchema,
  type inspectionListQuerySchema,
  type inspectionRecordSchema,
  type inspectionReleaseSchema,
  type inspectionReworkSchema,
  type inspectionScheduleQuerySchema,
  type inspectionScheduleSchema,
  NOT_APPLICABLE_DETAIL,
  inspectionErrors,
} from "@otd/contracts/inspection";
import {
  type Database,
  type DbOrTx,
  type InspectionRoundRecord,
  type RuleCheckItem,
  cartons,
  customerOrders,
  customers,
  factories,
  inspectionLogs,
  inspections,
  orderLines,
  packagingPlans,
  productionProgress,
  roles,
  styles,
  systemParams,
  testReportLinks,
  testReports,
  userRoles,
  users,
} from "@otd/db";
import { GATES, addDays, canTransition, round, statusLabel } from "@otd/shared";
import { type SQL, and, asc, between, desc, eq, ilike, inArray, isNotNull, lt, ne, or } from "drizzle-orm";
import type { z } from "zod";
import { type AccessContext, systemContext } from "../../core/access/access.types.js";
import { assertCanSee, scoped } from "../../core/access/scope.js";
import { AuditService } from "../../core/audit.service.js";
import { Clock } from "../../core/clock.js";
import { AppError, gateBlocked, illegalTransition, versionConflict } from "../../core/errors.js";
import { EventBus, inTransaction } from "../../core/events.js";
import { NumberingService } from "../../core/numbering.service.js";
import { countAll, iso, likeKeyword, orderBy, paginate } from "../../core/paging.js";
import { Scheduler } from "../../core/scheduler.js";
import { DB } from "../../core/tokens.js";
import { FlowConfigService } from "../flow/flow-config.service.js";
import { NotificationService } from "../notification/notification.service.js";
import { TodoService } from "../todo/todo.service.js";

type Row = typeof inspections.$inferSelect;
type Status = InspectionDto["status"];
type CheckResult = Omit<ReleaseCheckItemDto, "applicable">;
type ReleaseParams = { limit: number; days: number };

const DEFAULT_DAILY_LIMIT = 5;
const DEFAULT_RELEASE_DAYS = 15;
const ACTIVE_SLOT_STATUSES = ["SCHEDULED", "INSPECTED", "REWORK", "RELEASED"];
const G2 = GATES.G2.conditions;

const dueAt = (date: string) => new Date(`${date}T10:00:00.000Z`);

@Injectable()
export class InspectionService implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly audit: AuditService,
    private readonly numbering: NumberingService,
    private readonly events: EventBus,
    private readonly clock: Clock,
    private readonly todos: TodoService,
    private readonly notifications: NotificationService,
    private readonly scheduler: Scheduler,
    private readonly flow: FlowConfigService,
  ) {}

  onModuleInit(): void {
    this.scheduler.register({ name: "inspection.daily", dailyAt: "01:10", run: () => this.runDaily() });
  }

  private visible(ctx: AccessContext): SQL {
    return scoped(inspections, ctx);
  }

  private async load(ctx: AccessContext, id: string, db: DbOrTx = this.db): Promise<Row> {
    const row = (await db.select().from(inspections).where(eq(inspections.id, id)))[0];
    return assertCanSee(ctx, row);
  }

  async list(ctx: AccessContext, q: z.infer<typeof inspectionListQuerySchema>): Promise<Page<InspectionDto>> {
    const conds: SQL[] = [this.visible(ctx)];
    if (q.status?.length) conds.push(inArray(inspections.status, q.status));
    if (q.stage?.length) conds.push(inArray(inspections.stage, q.stage));
    if (q.result?.length) conds.push(inArray(inspections.result, q.result));
    if (q.customerId) conds.push(eq(inspections.customerId, q.customerId));
    if (q.orderId) conds.push(eq(inspections.orderId, q.orderId));
    if (q.styleId) conds.push(eq(inspections.styleId, q.styleId));
    if (q.factoryId) conds.push(eq(inspections.factoryId, q.factoryId));
    const kw = likeKeyword(q.keyword);
    if (kw) {
      const orderIds = (await this.db.select({ id: customerOrders.id }).from(customerOrders).where(ilike(customerOrders.poNo, kw))).map((o) => o.id);
      const styleIds = (await this.db.select({ id: styles.id }).from(styles).where(or(ilike(styles.styleNo, kw), ilike(styles.nameZh, kw), ilike(styles.nameEn, kw)))).map((s) => s.id);
      const parts: SQL[] = [ilike(inspections.docNo, kw)];
      if (orderIds.length) parts.push(inArray(inspections.orderId, orderIds));
      if (styleIds.length) parts.push(inArray(inspections.styleId, styleIds));
      conds.push(or(...parts)!);
    }
    const where = and(...conds);
    const sort = orderBy(q.sort, { docNo: inspections.docNo, plannedDate: inspections.plannedDate, actualDate: inspections.actualDate, createdAt: inspections.createdAt }, [desc(inspections.createdAt)]);
    return paginate(
      q,
      async () => (await this.db.select({ n: countAll }).from(inspections).where(where))[0]!.n,
      async (limit, offset) => this.toDtos(await this.db.select().from(inspections).where(where).orderBy(...sort).limit(limit).offset(offset)),
    );
  }

  async kpis(ctx: AccessContext): Promise<InspectionKpiDto> {
    const rows = await this.db.select({ stage: inspections.stage, status: inspections.status, result: inspections.result }).from(inspections).where(and(this.visible(ctx), ne(inspections.status, "CANCELLED")));
    const byStage: Record<string, number> = { IPI: 0, DPI: 0, FRI: 0 };
    for (const r of rows) byStage[r.stage] = (byStage[r.stage] ?? 0) + 1;
    return {
      total: rows.length,
      byStage,
      toSchedule: rows.filter((r) => r.status === "TO_SCHEDULE").length,
      failed: rows.filter((r) => (r.status === "INSPECTED" || r.status === "REWORK") && r.result === "FAIL").length,
      toRelease: rows.filter((r) => r.stage === "FRI" && r.status === "INSPECTED" && r.result === "PASS").length,
      released: rows.filter((r) => r.status === "RELEASED").length,
    };
  }

  async get(ctx: AccessContext, id: string): Promise<InspectionDetailDto> {
    const row = await this.load(ctx, id);
    const dto = (await this.toDtos([row]))[0]!;
    const logs = await this.db.select().from(inspectionLogs).where(eq(inspectionLogs.inspectionId, id)).orderBy(asc(inspectionLogs.at));
    const same = await this.db.select().from(inspections).where(and(this.visible(ctx), eq(inspections.orderId, row.orderId))).orderBy(asc(inspections.createdAt));
    return {
      ...dto,
      rounds: row.rounds,
      logs: logs.map((l): InspectionLogDto => ({ id: l.id, at: l.at.toISOString(), action: l.action, fromStatus: l.fromStatus, toStatus: l.toStatus, note: l.note, operatorName: l.operatorName })),
      sameOrder: await this.toDtos(same),
    };
  }

  async scheduleView(ctx: AccessContext, q: z.infer<typeof inspectionScheduleQuerySchema>): Promise<InspectionScheduleViewDto> {
    const from = q.from ?? this.clock.today();
    const to = q.to ?? addDays(from, 13);
    const limit = await this.dailyLimit();
    const conds: SQL[] = [this.visible(ctx), inArray(inspections.status, ACTIVE_SLOT_STATUSES), isNotNull(inspections.plannedDate), between(inspections.plannedDate, from, to)];
    if (q.factoryId) conds.push(eq(inspections.factoryId, q.factoryId));
    const rows = await this.db.select().from(inspections).where(and(...conds)).orderBy(asc(inspections.plannedDate));
    const dtos = await this.toDtos(rows);
    const groups = new Map<string, { date: string; factoryId: string | null; factoryName: string | null; rows: Row[]; items: InspectionDto[] }>();
    rows.forEach((r, i) => {
      const key = `${r.plannedDate}|${r.factoryId ?? ""}`;
      const g = groups.get(key) ?? { date: r.plannedDate!, factoryId: r.factoryId, factoryName: dtos[i]!.factoryName, rows: [], items: [] };
      g.rows.push(r);
      g.items.push(dtos[i]!);
      groups.set(key, g);
    });
    const unscheduledConds: SQL[] = [this.visible(ctx), eq(inspections.status, "TO_SCHEDULE")];
    if (q.factoryId) unscheduledConds.push(eq(inspections.factoryId, q.factoryId));
    const unscheduled = await this.db.select().from(inspections).where(and(...unscheduledConds)).orderBy(asc(inspections.plannedExFactory), asc(inspections.createdAt));
    const customerLimits = new Map<string, number>();
    for (const cid of new Set(rows.map((r) => r.customerId))) customerLimits.set(cid, (await this.releaseParams(cid, null)).limit);
    return {
      from,
      to,
      limit,
      days: [...groups.values()]
        .sort((a, b) => a.date.localeCompare(b.date) || (a.factoryName ?? "").localeCompare(b.factoryName ?? ""))
        .map((g) => {
          const styleCount = new Set(g.rows.map(slotKey)).size;
          const dayLimit = Math.min(...g.rows.map((r) => customerLimits.get(r.customerId) ?? limit));
          return {
            date: g.date,
            factoryId: g.factoryId,
            factoryName: g.factoryName,
            styleCount,
            limit: dayLimit,
            full: styleCount >= dayLimit,
            items: g.items.map((d) => ({ id: d.id, docNo: d.docNo, stage: d.stage, status: d.status, poNo: d.poNo, customerName: d.customerName, styleNo: d.styleNo, inspector: d.inspector, channel: d.channel })),
          };
        }),
      unscheduled: await this.toDtos(unscheduled),
    };
  }

  async create(ctx: AccessContext, input: z.infer<typeof inspectionCreateSchema>): Promise<InspectionDto> {
    const row = await inTransaction(this.db, this.events, async (tx, emit) => {
      const order = assertCanSee(ctx, (await tx.select().from(customerOrders).where(eq(customerOrders.id, input.orderId)))[0]);
      const lines = await tx.select().from(orderLines).where(eq(orderLines.orderId, order.id));
      const styleId = input.styleId ?? null;
      if (styleId && !lines.some((l) => l.styleId === styleId)) throw new AppError(inspectionErrors.INSPECTION_STYLE_NOT_IN_ORDER);
      const scope = styleId ? lines.filter((l) => l.styleId === styleId) : lines;
      const runtime = await this.flow.enabledNodes(order.customerId, order.flowVersionId, tx);
      const stages = runtime.params.inspectionStages ?? [];
      if (stages.length && !stages.includes(input.stage)) throw new AppError(inspectionErrors.INSPECTION_STAGE_NOT_ENABLED, { stage: input.stage, enabled: stages.join(" / ") });
      const snapshot = await this.progressSnapshot(tx, order, styleId);
      const docNo = await this.numbering.next("inspection", tx);
      const created = (
        await tx
          .insert(inspections)
          .values({
            docNo,
            orderId: order.id,
            styleId,
            color: input.color ?? scope[0]?.color ?? null,
            stage: input.stage,
            roundNo: 1,
            factoryId: order.factoryId,
            plannedDate: input.plannedDate ?? null,
            plannedExFactory: input.plannedExFactory ?? order.factoryReplyDate ?? order.customerDueDate,
            method: input.method ?? null,
            inspector: input.inspector ?? null,
            channel: input.channel ?? null,
            aql: input.aql ?? runtime.params.aqlLevel ?? "AQL 1.5 Level I",
            granularity: input.granularity ?? "PO + 款号 + SKU + 尺码",
            orderQty: scope.reduce((s, l) => s + l.quantity, 0) || order.totalPairs,
            ...snapshot,
            plannedSampleQty: input.plannedSampleQty ?? null,
            preconditions: input.preconditions ?? [],
            requirements: input.requirements ?? null,
            status: "TO_SCHEDULE",
            ownerId: order.ownerId,
            orgId: order.orgId,
            customerId: order.customerId,
            createdBy: ctx.userId,
          })
          .returning()
      )[0]!;
      await this.writeLog(tx, ctx, created.id, "create", null, "TO_SCHEDULE", `${input.stage} 验货申请`);
      await this.audit.log(ctx, { action: "inspection.inspection.create", objectType: "inspection", objectId: created.id, docNo }, tx);
      for (const userId of await this.usersWithRole(tx, "R006")) {
        await this.todos.upsert({ fingerprint: `inspection:schedule:${created.id}:${userId}`, source: "FLOW", action: "inspection.schedule", title: `安排验货排期 ${docNo}`, description: `${order.poNo} · ${input.stage}`, docType: "inspection", docId: created.id, docNo, link: `/inspections/${created.id}`, customerId: order.customerId, assigneeId: userId, dueAt: input.plannedDate ? dueAt(input.plannedDate) : null }, tx);
      }
      emit({ type: "inspection.inspection.created", aggregateType: "inspection", aggregateId: created.id, payload: { docNo, orderId: order.id, stage: input.stage } });
      return created;
    });
    return (await this.toDtos([row]))[0]!;
  }

  async schedule(ctx: AccessContext, id: string, input: z.infer<typeof inspectionScheduleSchema>): Promise<InspectionDto> {
    const row = await inTransaction(this.db, this.events, async (tx, emit) => {
      const before = await this.load(ctx, id, tx);
      if (before.version !== input.version) throw versionConflict();
      if (!canTransition("inspection", before.status as Status, "SCHEDULED")) throw illegalTransition(before.status, "schedule");
      const flowVersionId = (await tx.select({ v: customerOrders.flowVersionId }).from(customerOrders).where(eq(customerOrders.id, before.orderId)))[0]?.v ?? null;
      const { limit, days } = await this.releaseParams(before.customerId, flowVersionId, tx);
      if (before.factoryId) {
        const sameDay = await tx
          .select({ id: inspections.id, styleId: inspections.styleId, orderId: inspections.orderId })
          .from(inspections)
          .where(and(eq(inspections.factoryId, before.factoryId), eq(inspections.plannedDate, input.plannedDate), inArray(inspections.status, ACTIVE_SLOT_STATUSES), ne(inspections.id, before.id)));
        const keys = new Set(sameDay.map(slotKey));
        if (!keys.has(slotKey(before)) && keys.size >= limit) {
          const factory = (await tx.select({ name: factories.name }).from(factories).where(eq(factories.id, before.factoryId)))[0];
          throw new AppError(inspectionErrors.INSPECTION_DAILY_LIMIT, { factory: factory?.name ?? "", date: input.plannedDate, count: keys.size, limit });
        }
      }
      let warning: string | null = null;
      if (before.stage === "FRI" && before.plannedExFactory) {
        const deadline = addDays(before.plannedExFactory, -days);
        if (input.plannedDate > deadline) warning = `终验计划 ${input.plannedDate} 晚于工厂交期前 ${days} 天（${deadline}）`;
      }
      const patch: Partial<Row> = { plannedDate: input.plannedDate, scheduleWarning: warning };
      if (input.inspector !== undefined) patch.inspector = input.inspector;
      if (input.channel !== undefined) patch.channel = input.channel;
      if (input.method !== undefined) patch.method = input.method;
      if (input.plannedSampleQty !== undefined) patch.plannedSampleQty = input.plannedSampleQty;
      const updated = await this.update(tx, ctx, before, "SCHEDULED", patch);
      await this.writeLog(tx, ctx, id, "schedule", before.status, "SCHEDULED", [`计划验货日 ${input.plannedDate}`, warning].filter(Boolean).join("；"));
      await this.audit.log(ctx, { action: "inspection.inspection.schedule", objectType: "inspection", objectId: id, docNo: before.docNo, diff: { status: { from: before.status, to: "SCHEDULED" }, plannedDate: { from: before.plannedDate, to: input.plannedDate } } }, tx);
      await this.todos.closeByPrefix(`inspection:schedule:${id}`, tx);
      emit({ type: "inspection.inspection.scheduled", aggregateType: "inspection", aggregateId: id, payload: { docNo: before.docNo, orderId: before.orderId, plannedDate: input.plannedDate } });
      return updated;
    });
    return (await this.toDtos([row]))[0]!;
  }

  async record(ctx: AccessContext, id: string, input: z.infer<typeof inspectionRecordSchema>): Promise<InspectionDto> {
    if (input.defectQty > input.actualSampleQty) throw new AppError(inspectionErrors.INSPECTION_DEFECT_EXCEEDS_SAMPLE);
    const row = await inTransaction(this.db, this.events, async (tx, emit) => {
      const before = await this.load(ctx, id, tx);
      if (before.version !== input.version) throw versionConflict();
      if (!canTransition("inspection", before.status as Status, "INSPECTED")) throw illegalTransition(before.status, "result");
      const roundNo = before.status === "REWORK" ? before.roundNo + 1 : before.roundNo;
      const defectRate = round(input.defectQty / input.actualSampleQty, 4);
      const record: InspectionRoundRecord = {
        roundNo,
        result: input.result,
        actualDate: input.actualDate,
        actualSampleQty: input.actualSampleQty,
        defectQty: input.defectQty,
        defectRate,
        defectNote: input.defectNote ?? null,
        correctiveAction: input.correctiveAction ?? null,
        recordedAt: this.clock.now().toISOString(),
        recordedBy: ctx.userName,
      };
      const order = (await tx.select().from(customerOrders).where(eq(customerOrders.id, before.orderId)))[0]!;
      const snapshot = await this.progressSnapshot(tx, order, before.styleId);
      const patch: Partial<Row> = {
        roundNo,
        result: input.result,
        actualDate: input.actualDate,
        actualSampleQty: input.actualSampleQty,
        defectQty: input.defectQty,
        defectRate,
        defectNote: input.defectNote ?? null,
        correctiveAction: input.correctiveAction ?? (input.result === "FAIL" ? before.correctiveAction : null),
        rounds: [...before.rounds, record],
        ...snapshot,
      };
      if (input.inspector !== undefined) patch.inspector = input.inspector;
      if (input.reportFileId !== undefined) patch.reportFileId = input.reportFileId;
      const updated = await this.update(tx, ctx, before, "INSPECTED", patch);
      const verdict = input.result === "PASS" ? "合格" : "不合格";
      const note = `第 ${roundNo} 轮${roundNo > 1 ? "复验" : ""}${verdict}${input.defectNote ? `（${input.defectNote}）` : ""} · 不合格率 ${(defectRate * 100).toFixed(1)}%`;
      await this.writeLog(tx, ctx, id, "result", before.status, "INSPECTED", note);
      await this.audit.log(ctx, { action: "inspection.inspection.result", objectType: "inspection", objectId: id, docNo: before.docNo, diff: { status: { from: before.status, to: "INSPECTED" }, result: { from: before.result, to: input.result } } }, tx);
      await this.todos.closeByPrefix(`inspection:result:${id}`, tx);
      if (input.result === "FAIL") {
        await this.notifications.notify([before.ownerId], { type: "inspection.failed", title: `${before.docNo} ${before.stage} 第 ${roundNo} 轮不合格`, body: input.defectNote ?? null, link: `/inspections/${id}` }, tx);
        if (before.stage === "FRI") await this.openReworkTodos(tx, updated);
      }
      emit({ type: "inspection.inspection.inspected", aggregateType: "inspection", aggregateId: id, payload: { docNo: before.docNo, orderId: before.orderId, styleId: before.styleId, stage: before.stage, roundNo, result: input.result } });
      return updated;
    });
    return (await this.toDtos([row]))[0]!;
  }

  async rework(ctx: AccessContext, id: string, input: z.infer<typeof inspectionReworkSchema>): Promise<InspectionDto> {
    const row = await inTransaction(this.db, this.events, async (tx, emit) => {
      const before = await this.load(ctx, id, tx);
      if (before.version !== input.version) throw versionConflict();
      if (!canTransition("inspection", before.status as Status, "REWORK")) throw illegalTransition(before.status, "rework");
      if (before.result !== "FAIL") throw new AppError(inspectionErrors.INSPECTION_REWORK_FAILED_ONLY);
      const patch: Partial<Row> = {};
      if (input.correctiveAction) patch.correctiveAction = input.correctiveAction;
      if (input.plannedDate) patch.plannedDate = input.plannedDate;
      const updated = await this.update(tx, ctx, before, "REWORK", patch);
      await this.writeLog(tx, ctx, id, "rework", before.status, "REWORK", [`发起第 ${before.roundNo + 1} 轮复验`, input.correctiveAction ? `整改措施：${input.correctiveAction}` : null, input.note ?? null].filter(Boolean).join("；"));
      await this.audit.log(ctx, { action: "inspection.inspection.rework", objectType: "inspection", objectId: id, docNo: before.docNo, diff: { status: { from: before.status, to: "REWORK" } } }, tx);
      await this.todos.closeByPrefix(`inspection:rework:${id}`, tx);
      emit({ type: "inspection.inspection.reworked", aggregateType: "inspection", aggregateId: id, payload: { docNo: before.docNo, orderId: before.orderId, nextRound: before.roundNo + 1 } });
      return updated;
    });
    return (await this.toDtos([row]))[0]!;
  }

  async cancel(ctx: AccessContext, id: string, input: z.infer<typeof inspectionCancelSchema>): Promise<InspectionDto> {
    const row = await inTransaction(this.db, this.events, async (tx, emit) => {
      const before = await this.load(ctx, id, tx);
      if (before.version !== input.version) throw versionConflict();
      if (!canTransition("inspection", before.status as Status, "CANCELLED")) throw illegalTransition(before.status, "cancel");
      const updated = await this.update(tx, ctx, before, "CANCELLED", { cancelReason: input.reason });
      await this.writeLog(tx, ctx, id, "cancel", before.status, "CANCELLED", input.reason);
      await this.audit.log(ctx, { action: "inspection.inspection.cancel", objectType: "inspection", objectId: id, docNo: before.docNo, diff: { status: { from: before.status, to: "CANCELLED" } } }, tx);
      await this.todos.closeForDoc("inspection", id, tx);
      emit({ type: "inspection.inspection.cancelled", aggregateType: "inspection", aggregateId: id, payload: { docNo: before.docNo, orderId: before.orderId } });
      return updated;
    });
    return (await this.toDtos([row]))[0]!;
  }

  async releaseCheck(ctx: AccessContext, id: string): Promise<ReleaseCheckDto> {
    const row = await this.load(ctx, id);
    const flowVersionId = (await this.db.select({ v: customerOrders.flowVersionId }).from(customerOrders).where(eq(customerOrders.id, row.orderId)))[0]?.v ?? null;
    const { limit, days } = await this.releaseParams(row.customerId, flowVersionId);
    if (row.status === "RELEASED" && row.releaseCheck) {
      const items = fromRuleItems(row.releaseCheck);
      return { passed: items.every((i) => i.passed), refDate: row.plannedExFactory ?? this.clock.today(), items, missing: items.filter((i) => !i.passed).map((i) => i.label.zh), releasable: false, concessionAvailable: false, dailyLimit: limit, releaseDays: days };
    }
    return { ...(await this.evaluate(row, this.db)), dailyLimit: limit, releaseDays: days };
  }

  async release(ctx: AccessContext, id: string, input: z.infer<typeof inspectionReleaseSchema>): Promise<InspectionDto> {
    const outcome = await inTransaction(this.db, this.events, async (tx, emit): Promise<{ row: Row } | { missing: string[] }> => {
      const before = await this.load(ctx, id, tx);
      if (before.version !== input.version) throw versionConflict();
      if (before.stage !== "FRI") throw new AppError(inspectionErrors.INSPECTION_RELEASE_FINAL_ONLY);
      if (!canTransition("inspection", before.status as Status, "RELEASED")) throw illegalTransition(before.status, "release");
      const check = await this.evaluate(before, tx);
      const concession = !!input.concessionReason;
      const finalItem = check.items.find((i) => i.key === "finalPassed")!;
      if (concession && finalItem.passed) throw new AppError(inspectionErrors.INSPECTION_CONCESSION_NOT_NEEDED);
      const blocking = check.items.filter((i) => !i.passed && !(concession && i.key === "finalPassed" && before.result === "FAIL"));
      if (blocking.length) {
        await tx.update(inspections).set({ releaseCheck: toRuleItems(check.items) }).where(eq(inspections.id, id));
        await this.writeLog(tx, ctx, id, "release_blocked", before.status, before.status, blocking.map((b) => `${b.label.zh}：${b.detail ?? ""}`).join("；"));
        return { missing: blocking.map((b) => b.label.zh) };
      }
      const updated = await this.update(tx, ctx, before, "RELEASED", {
        releasedAt: this.clock.now(),
        releasedBy: ctx.userId,
        releaseCheck: toRuleItems(check.items),
        concession,
        concessionReason: input.concessionReason ?? null,
      });
      await this.writeLog(tx, ctx, id, concession ? "release_concession" : "release", before.status, "RELEASED", [concession ? `让步放行：${input.concessionReason}` : "G2 三条件满足", input.note ?? null].filter(Boolean).join("；"));
      await this.audit.log(ctx, { action: "inspection.inspection.release", objectType: "inspection", objectId: id, docNo: before.docNo, diff: { status: { from: before.status, to: "RELEASED" }, concession: { from: false, to: concession } } }, tx);
      await this.todos.closeForDoc("inspection", id, tx);
      emit({ type: "inspection.inspection.released", aggregateType: "inspection", aggregateId: id, payload: { docNo: before.docNo, orderId: before.orderId, styleId: before.styleId, concession } });
      return { row: updated };
    });
    if ("missing" in outcome) throw gateBlocked("G2", outcome.missing);
    return (await this.toDtos([outcome.row]))[0]!;
  }

  async runDaily(): Promise<{ resultDue: number; reworkDue: number }> {
    const today = this.clock.today();
    const ctx = systemContext();
    return this.db.transaction(async (tx) => {
      const quality = await this.usersWithRole(tx, "R005");
      const pending = await tx.select().from(inspections).where(and(inArray(inspections.status, ["SCHEDULED", "REWORK"]), isNotNull(inspections.plannedDate), lt(inspections.plannedDate, today)));
      for (const r of pending) {
        for (const userId of quality) {
          await this.todos.upsert({ fingerprint: `inspection:result:${r.id}:${userId}`, source: "FLOW", action: "inspection.result", title: `登记验货结果 ${r.docNo}`, description: `${r.stage}${r.status === "REWORK" ? ` 第 ${r.roundNo + 1} 轮复验` : ""} · 计划 ${r.plannedDate}`, docType: "inspection", docId: r.id, docNo: r.docNo, link: `/inspections/${r.id}`, customerId: r.customerId, assigneeId: userId, dueAt: dueAt(addDays(r.plannedDate!, 1)) }, tx);
        }
      }
      const failed = await tx.select().from(inspections).where(and(eq(inspections.status, "INSPECTED"), eq(inspections.stage, "FRI"), eq(inspections.result, "FAIL")));
      for (const r of failed) await this.openReworkTodos(tx, r, quality);
      if (pending.length || failed.length) await this.audit.log(ctx, { action: "inspection.daily", diff: { resultDue: pending.length, reworkDue: failed.length } }, tx);
      return { resultDue: pending.length, reworkDue: failed.length };
    });
  }

  private async openReworkTodos(tx: DbOrTx, r: Row, quality?: string[]): Promise<void> {
    const assignees = quality ?? (await this.usersWithRole(tx, "R005"));
    for (const userId of assignees) {
      await this.todos.upsert({ fingerprint: `inspection:rework:${r.id}:${userId}`, source: "FLOW", action: "inspection.rework", title: `尾验不合格待整改复验 ${r.docNo}`, description: `第 ${r.roundNo} 轮${r.defectNote ? ` · ${r.defectNote}` : ""}`, docType: "inspection", docId: r.id, docNo: r.docNo, link: `/inspections/${r.id}`, customerId: r.customerId, assigneeId: userId, dueAt: dueAt(addDays(r.actualDate ?? this.clock.today(), 2)) }, tx);
    }
  }

  private async evaluate(row: Row, db: DbOrTx): Promise<Omit<ReleaseCheckDto, "dailyLimit" | "releaseDays">> {
    const today = this.clock.today();
    const refDate = row.plannedExFactory ?? today;
    const order = (await db.select().from(customerOrders).where(eq(customerOrders.id, row.orderId)))[0]!;
    const lines = await db.select().from(orderLines).where(eq(orderLines.orderId, row.orderId));
    const styleIds = row.styleId ? [row.styleId] : [...new Set(lines.map((l) => l.styleId))];
    const styleRows = styleIds.length ? await db.select({ id: styles.id, styleNo: styles.styleNo }).from(styles).where(inArray(styles.id, styleIds)) : [];
    const styleNo = new Map(styleRows.map((s) => [s.id, s.styleNo]));
    const enabled = await this.flow.gateConditions(order.customerId, "G2", order.flowVersionId, db);
    const checks: Record<string, () => Promise<CheckResult>> = {
      finalPassed: () => this.checkFinal(row, db),
      reportsValid: () => this.checkReports(styleIds, styleNo, refDate, today, db),
      packingReady: () => this.checkPacking(order.id, lines, styleNo, db),
    };
    const items: ReleaseCheckItemDto[] = [];
    for (const def of G2) {
      if (!enabled.includes(def.key)) items.push({ key: def.key, label: def.label, passed: true, applicable: false, detail: NOT_APPLICABLE_DETAIL });
      else items.push({ ...(await checks[def.key]!()), applicable: true });
    }
    const passed = items.every((i) => i.passed);
    const finalItem = items[0]!;
    const finalRound = row.stage === "FRI" && row.status === "INSPECTED";
    return {
      passed,
      refDate,
      items,
      missing: items.filter((i) => !i.passed).map((i) => i.label.zh),
      releasable: finalRound && passed,
      concessionAvailable: finalRound && !finalItem.passed && row.result === "FAIL" && items.slice(1).every((i) => i.passed),
    };
  }

  private async checkFinal(row: Row, db: DbOrTx): Promise<CheckResult> {
    const conds: SQL[] = [eq(inspections.orderId, row.orderId), eq(inspections.stage, "FRI"), ne(inspections.status, "CANCELLED"), isNotNull(inspections.result)];
    if (row.styleId) conds.push(eq(inspections.styleId, row.styleId));
    const finals = await db.select().from(inspections).where(and(...conds));
    const latest = finals.sort((a, b) => (b.actualDate ?? "").localeCompare(a.actualDate ?? "") || b.roundNo - a.roundNo || b.updatedAt.getTime() - a.updatedAt.getTime())[0];
    const def = G2[0];
    if (!latest) return { key: def.key, label: def.label, passed: false, detail: "尚无终验（FRI）结论" };
    if (latest.result === "PASS") return { key: def.key, label: def.label, passed: true, detail: `${latest.docNo} 尾验第 ${latest.roundNo} 轮合格` };
    return { key: def.key, label: def.label, passed: false, detail: `${latest.docNo} 尾验第 ${latest.roundNo} 轮不合格${latest.defectNote ? `（${latest.defectNote}）` : ""}，待整改复验` };
  }

  private async checkReports(styleIds: string[], styleNo: Map<string, string>, refDate: string, today: string, db: DbOrTx): Promise<CheckResult> {
    const def = G2[1];
    if (!styleIds.length) return { key: def.key, label: def.label, passed: false, detail: "订单没有款" };
    const direct = await db.select().from(testReports).where(inArray(testReports.styleId, styleIds));
    const links = await db.select().from(testReportLinks).where(inArray(testReportLinks.styleId, styleIds));
    const linkedIds = links.map((l) => l.reportId).filter((rid) => !direct.some((d) => d.id === rid));
    const linked = linkedIds.length ? await db.select().from(testReports).where(inArray(testReports.id, linkedIds)) : [];
    const problems: string[] = [];
    const ok: string[] = [];
    for (const sid of styleIds) {
      const reportIds = new Set([...direct.filter((r) => r.styleId === sid).map((r) => r.id), ...links.filter((l) => l.styleId === sid).map((l) => l.reportId)]);
      const reports = [...direct, ...linked].filter((r) => reportIds.has(r.id)).sort((a, b) => b.issuedDate.localeCompare(a.issuedDate) || b.createdAt.getTime() - a.createdAt.getTime());
      if (!reports.length) {
        problems.push(`款 #${styleNo.get(sid) ?? ""} 没有测试报告`);
        continue;
      }
      const decided = new Set<string>();
      for (const r of reports) {
        const keys = r.items.length ? r.items : ["*"];
        const fresh = keys.filter((k) => !decided.has(k));
        if (!fresh.length) continue;
        for (const k of fresh) decided.add(k);
        if (r.result !== "PASS") problems.push(`报告 ${r.agencyReportNo} 结论不合格`);
        else if (r.validUntil < today) problems.push(`报告 ${r.agencyReportNo} 已于 ${r.validUntil} 过期`);
        else if (r.validUntil < refDate) problems.push(`报告 ${r.agencyReportNo} 将于 ${r.validUntil} 过期，早于计划出厂日 ${refDate}`);
        else ok.push(`${r.agencyReportNo} · 至 ${r.validUntil}`);
      }
    }
    if (problems.length) return { key: def.key, label: def.label, passed: false, detail: problems.join("；") };
    return { key: def.key, label: def.label, passed: true, detail: ok.join("；") };
  }

  private async checkPacking(orderId: string, lines: (typeof orderLines.$inferSelect)[], styleNo: Map<string, string>, db: DbOrTx): Promise<CheckResult> {
    const def = G2[2];
    const plans = await db.select().from(packagingPlans).where(eq(packagingPlans.orderId, orderId)).orderBy(desc(packagingPlans.createdAt));
    if (!plans.length) return { key: def.key, label: def.label, passed: false, detail: "订单尚未建立包装方案" };
    const plan = plans.find((p) => p.effectiveVersion !== null || p.status === "CONFIRMED");
    if (!plan) {
      const latest = plans[0]!;
      return { key: def.key, label: def.label, passed: false, detail: `${latest.docNo} v${latest.currentVersion} ${statusLabel("packagingPlan", latest.status).zh}，尚无客户确认的生效版本` };
    }
    const planLabel = `${plan.docNo} v${plan.effectiveVersion ?? plan.currentVersion}`;
    const boxes = await db.select().from(cartons).where(eq(cartons.orderId, orderId));
    const covers = (c: (typeof boxes)[number], l: (typeof lines)[number]) =>
      c.orderLineId ? c.orderLineId === l.id : (c.styleId === l.styleId || (!!c.customerSku && c.customerSku === l.sku)) && (!l.size || c.size === l.size) && (!l.color || !c.color || c.color === l.color);
    const missing = lines.filter((l) => !boxes.some((c) => covers(c, l)));
    if (missing.length) {
      const sample = missing
        .slice(0, 3)
        .map((l) => `#${styleNo.get(l.styleId) ?? ""} ${[l.color, l.size].filter(Boolean).join("/")}`)
        .join("、");
      return { key: def.key, label: def.label, passed: false, detail: `装箱单未覆盖 ${sample}${missing.length > 3 ? ` 等 ${missing.length} 项` : ""}` };
    }
    const docNos = [...new Set(boxes.map((b) => b.docNo))];
    return { key: def.key, label: def.label, passed: true, detail: `${planLabel} · ${docNos.slice(0, 3).join(" / ")}${docNos.length > 3 ? ` 等 ${docNos.length} 张` : ""}` };
  }

  private async update(tx: DbOrTx, ctx: AccessContext, before: Row, to: Status, patch: Partial<Row>): Promise<Row> {
    const updated = (
      await tx
        .update(inspections)
        .set({ ...patch, status: to, version: before.version + 1, updatedBy: ctx.system ? null : ctx.userId })
        .where(and(eq(inspections.id, before.id), eq(inspections.version, before.version)))
        .returning()
    )[0];
    if (!updated) throw versionConflict();
    return updated;
  }

  private async writeLog(tx: DbOrTx, ctx: AccessContext, inspectionId: string, action: string, fromStatus: string | null, toStatus: string | null, note: string | null): Promise<void> {
    await tx.insert(inspectionLogs).values({ inspectionId, at: this.clock.now(), action, fromStatus, toStatus, note, operatorId: ctx.system ? null : ctx.userId, operatorName: ctx.system ? "系统" : ctx.userName });
  }

  private async progressSnapshot(tx: DbOrTx, order: typeof customerOrders.$inferSelect, styleId: string | null): Promise<Pick<Row, "cartonCount" | "productionRate" | "packingRate">> {
    const progress = (await tx.select().from(productionProgress).where(eq(productionProgress.orderId, order.id)).orderBy(desc(productionProgress.reportDate), desc(productionProgress.createdAt)))[0];
    const boxes = await tx.select().from(cartons).where(styleId ? and(eq(cartons.orderId, order.id), eq(cartons.styleId, styleId)) : eq(cartons.orderId, order.id));
    const cartonCount = boxes.reduce((s, b) => s + b.cartonCount, 0);
    return {
      cartonCount: boxes.length ? cartonCount : null,
      productionRate: progress?.completionRate ?? null,
      packingRate: progress && order.totalPairs ? round(Math.min(1, progress.packedPairs / order.totalPairs), 4) : null,
    };
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

  private async param(db: DbOrTx, key: string, fallback: number): Promise<number> {
    const row = (await db.select().from(systemParams).where(eq(systemParams.key, key)))[0];
    const value = typeof row?.value === "number" ? row.value : Number(row?.value);
    return Number.isFinite(value) && value > 0 ? value : fallback;
  }

  private dailyLimit(db: DbOrTx = this.db): Promise<number> {
    return this.param(db, "inspection.dailyLimitPerFactory", DEFAULT_DAILY_LIMIT);
  }

  private releaseDays(db: DbOrTx = this.db): Promise<number> {
    return this.param(db, "inspection.releaseDaysBeforeExFactory", DEFAULT_RELEASE_DAYS);
  }

  private async releaseParams(customerId: string, flowVersionId: string | null, db: DbOrTx = this.db): Promise<ReleaseParams> {
    const runtime = await this.flow.enabledNodes(customerId, flowVersionId, db);
    const base = await this.flow.rulePack("RELEASE", null, db);
    const merged = await this.flow.rulePack("RELEASE", customerId, db);
    const positive = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : undefined);
    const pick = (key: "sameFactorySameDayLimit" | "releaseDaysBeforeExFactory") =>
      (merged[key] !== base[key] ? positive(merged[key]) : undefined) ?? (runtime.configured ? positive(runtime.params[key]) : undefined) ?? positive(base[key]);
    return {
      limit: pick("sameFactorySameDayLimit") ?? (await this.dailyLimit(db)),
      days: pick("releaseDaysBeforeExFactory") ?? (await this.releaseDays(db)),
    };
  }

  private async toDtos(rows: Row[], db: DbOrTx = this.db): Promise<InspectionDto[]> {
    if (!rows.length) return [];
    const uniq = <T>(xs: (T | null)[]) => [...new Set(xs.filter((x): x is T => x !== null))];
    const orderIds = uniq(rows.map((r) => r.orderId));
    const styleIds = uniq(rows.map((r) => r.styleId));
    const factoryIds = uniq(rows.map((r) => r.factoryId));
    const orders = await db.select({ id: customerOrders.id, poNo: customerOrders.poNo, seasonCode: customerOrders.seasonCode }).from(customerOrders).where(inArray(customerOrders.id, orderIds));
    const custs = await db.select({ id: customers.id, name: customers.name }).from(customers).where(inArray(customers.id, uniq(rows.map((r) => r.customerId))));
    const owners = await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, uniq(rows.map((r) => r.ownerId))));
    const styleRows = styleIds.length ? await db.select({ id: styles.id, styleNo: styles.styleNo, nameZh: styles.nameZh, nameEn: styles.nameEn, seasonCode: styles.seasonCode }).from(styles).where(inArray(styles.id, styleIds)) : [];
    const factoryRows = factoryIds.length ? await db.select({ id: factories.id, name: factories.name }).from(factories).where(inArray(factories.id, factoryIds)) : [];
    return rows.map((r) => {
      const order = orders.find((o) => o.id === r.orderId);
      const style = styleRows.find((s) => s.id === r.styleId);
      return {
        id: r.id,
        docNo: r.docNo,
        orderId: r.orderId,
        poNo: order?.poNo ?? "",
        customerId: r.customerId,
        customerName: custs.find((c) => c.id === r.customerId)?.name ?? "",
        styleId: r.styleId,
        styleNo: style?.styleNo ?? null,
        styleName: style?.nameZh ?? null,
        styleNameEn: style?.nameEn ?? null,
        color: r.color,
        stage: r.stage as InspectionDto["stage"],
        roundNo: r.roundNo,
        factoryId: r.factoryId,
        factoryName: factoryRows.find((f) => f.id === r.factoryId)?.name ?? null,
        seasonCode: style?.seasonCode ?? order?.seasonCode ?? null,
        plannedDate: r.plannedDate,
        actualDate: r.actualDate,
        plannedExFactory: r.plannedExFactory,
        method: r.method,
        inspector: r.inspector,
        channel: r.channel,
        aql: r.aql,
        granularity: r.granularity,
        orderQty: r.orderQty,
        cartonCount: r.cartonCount,
        productionRate: r.productionRate,
        packingRate: r.packingRate,
        plannedSampleQty: r.plannedSampleQty,
        actualSampleQty: r.actualSampleQty,
        defectQty: r.defectQty,
        defectRate: r.defectRate,
        preconditions: r.preconditions,
        requirements: r.requirements,
        result: (r.result as InspectionDto["result"]) ?? null,
        defectNote: r.defectNote,
        correctiveAction: r.correctiveAction,
        status: r.status as Status,
        releasedAt: iso(r.releasedAt),
        releaseCheck: r.releaseCheck ? fromRuleItems(r.releaseCheck) : null,
        concession: r.concession,
        concessionReason: r.concessionReason,
        cancelReason: r.cancelReason,
        scheduleWarning: r.scheduleWarning,
        ownerId: r.ownerId,
        ownerName: owners.find((o) => o.id === r.ownerId)?.name ?? "",
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
        version: r.version,
      };
    });
  }
}

function fromRuleItems(items: RuleCheckItem[]): ReleaseCheckItemDto[] {
  return items.map((i) => ({ key: i.key, label: i.label, passed: i.passed, applicable: i.detail !== NOT_APPLICABLE_DETAIL, detail: i.detail ?? null }));
}

function toRuleItems(items: ReleaseCheckItemDto[]): RuleCheckItem[] {
  return items.map((i) => ({ key: i.key, label: i.label, passed: i.passed, ...(i.detail ? { detail: i.detail } : {}) }));
}

function slotKey(r: { styleId: string | null; orderId: string }): string {
  return r.styleId ?? `order:${r.orderId}`;
}
