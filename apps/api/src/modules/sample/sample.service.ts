import { Inject, Injectable, type OnModuleInit } from "@nestjs/common";
import type { Page } from "@otd/contracts/common";
import {
  type LibraryItemDto,
  type MaterialDto,
  type RoundDto,
  type RoundStatus,
  type RoundType,
  type SampleDetailDto,
  type SampleSummaryDto,
  type libraryListQuerySchema,
  type libraryUpsertSchema,
  type materialListQuerySchema,
  type materialUpsertSchema,
  type roundAdvanceSchema,
  type roundApproveSchema,
  type roundCreateSchema,
  type sampleCreateSchema,
  type sampleListQuerySchema,
  type sampleUpdateSchema,
  sampleErrors,
} from "@otd/contracts/sample";
import { type Database, type DbOrTx, customers, factories, orgs, plannings, sampleLibrary, sampleMaterials, sampleRounds, sampleStageLogs, samples, styles, users } from "@otd/db";
import { canTransition } from "@otd/shared";
import { type SQL, and, asc, desc, eq, ilike, inArray, isNull, or } from "drizzle-orm";
import type { z } from "zod";
import { type AccessContext, systemContext } from "../../core/access/access.types.js";
import { assertCanSee, requirePermission, scoped } from "../../core/access/scope.js";
import { AuditService, diffOf } from "../../core/audit.service.js";
import { Clock } from "../../core/clock.js";
import { AppError, assertFound, illegalTransition, notFound, versionConflict } from "../../core/errors.js";
import { type DomainEvent, EventBus, inTransaction } from "../../core/events.js";
import { NumberingService } from "../../core/numbering.service.js";
import { countAll, iso, likeKeyword, paginate } from "../../core/paging.js";
import { DB } from "../../core/tokens.js";
import { NotificationService } from "../notification/notification.service.js";
import { TodoService } from "../todo/todo.service.js";
import { firstUserWithRole } from "./assignees.js";
import { DAY, STAGE_INDEX, buildStages, currentRoundStatusIn, currentRoundTypeIs, currentRounds, hoursBetween, loadAverages, progressOf, remainingDays } from "./sample.stages.js";

type SampleRow = typeof samples.$inferSelect;
type RoundRow = typeof sampleRounds.$inferSelect;
type LogRow = typeof sampleStageLogs.$inferSelect;
type LibraryRow = typeof sampleLibrary.$inferSelect;
type MaterialRow = typeof sampleMaterials.$inferSelect;
type StyleRow = typeof styles.$inferSelect;
type Emit = (e: DomainEvent) => void;

export const TECH_ROLE = "R004";
const TERMINAL: RoundStatus[] = ["APPROVED", "REVISE"];

export type IssueFromPlanningInput = {
  style: StyleRow;
  planningId: string;
  roundType?: RoundType;
  quantity?: number;
  factoryId?: string | null;
  dueDate?: string | null;
  briefTranslation?: string | null;
  sizeRange?: string | null;
};

@Injectable()
export class SampleService implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly audit: AuditService,
    private readonly numbering: NumberingService,
    private readonly events: EventBus,
    private readonly clock: Clock,
    private readonly todos: TodoService,
    private readonly notifications: NotificationService,
  ) {}

  onModuleInit(): void {
    this.events.on("sampleship.shipment.sent", "sample.round.shipped", (e) => this.onShipmentSent(e.aggregateId, e.payload));
  }

  async list(ctx: AccessContext, q: z.infer<typeof sampleListQuerySchema>): Promise<Page<SampleSummaryDto>> {
    const conds: SQL[] = [scoped(samples, ctx)];
    if (q.customerId) conds.push(eq(samples.customerId, q.customerId));
    if (q.factoryId) conds.push(eq(samples.factoryId, q.factoryId));
    if (q.styleId) conds.push(eq(samples.styleId, q.styleId));
    if (q.status?.length) conds.push(currentRoundStatusIn(q.status));
    if (q.roundType) conds.push(currentRoundTypeIs(q.roundType));
    const kw = likeKeyword(q.keyword);
    if (kw) {
      const styleIds = this.db.select({ id: styles.id }).from(styles).where(or(ilike(styles.styleNo, kw), ilike(styles.nameZh, kw), ilike(styles.nameEn, kw)));
      conds.push(or(ilike(samples.docNo, kw), ilike(samples.customerRef, kw), inArray(samples.styleId, styleIds))!);
    }
    const where = and(...conds);
    return paginate(
      q,
      async () => (await this.db.select({ n: countAll }).from(samples).where(where))[0]!.n,
      async (limit, offset) => this.toSummaries(await this.db.select().from(samples).where(where).orderBy(desc(samples.createdAt), desc(samples.docNo)).limit(limit).offset(offset)),
    );
  }

  async get(ctx: AccessContext, id: string): Promise<SampleDetailDto> {
    const row = assertCanSee(ctx, (await this.db.select().from(samples).where(eq(samples.id, id)))[0]);
    return this.toDetail(ctx, row);
  }

  async create(ctx: AccessContext, input: z.infer<typeof sampleCreateSchema>): Promise<SampleDetailDto> {
    const row = await inTransaction(this.db, this.events, async (tx, emit) => {
      const style = assertCanSee(ctx, (await tx.select().from(styles).where(eq(styles.id, input.styleId)))[0]);
      const { styleId: _s, planningId, roundType, quantity, ...header } = input;
      return this.insertSample(ctx, tx, emit, style, { ...header, planningId: planningId ?? null }, { roundType, quantity, dueDate: header.dueDate ?? null });
    });
    return this.get(ctx, row.id);
  }

  async issueFromPlanning(ctx: AccessContext, tx: DbOrTx, emit: Emit, input: IssueFromPlanningInput): Promise<SampleRow> {
    const header = {
      planningId: input.planningId,
      factoryId: input.factoryId ?? null,
      dueDate: input.dueDate ?? null,
      briefTranslation: input.briefTranslation ?? null,
      size: input.sizeRange ?? null,
    };
    return this.insertSample(ctx, tx, emit, input.style, header, { roundType: input.roundType ?? "PROTO", quantity: input.quantity ?? 6, dueDate: input.dueDate ?? null });
  }

  private async insertSample(
    ctx: AccessContext,
    tx: DbOrTx,
    emit: Emit,
    style: StyleRow,
    header: Partial<typeof samples.$inferInsert>,
    round: { roundType: RoundType; quantity: number; dueDate: string | null },
  ): Promise<SampleRow> {
    const technician = ctx.roles.includes(TECH_ROLE) ? { id: ctx.userId } : await firstUserWithRole(tx, TECH_ROLE);
    const docNo = await this.numbering.next("sample", tx);
    const now = this.clock.now();
    const created = (
      await tx
        .insert(samples)
        .values({
          ...header,
          docNo,
          styleId: style.id,
          productCode: style.productCode,
          teamOrgId: header.teamOrgId ?? style.orgId,
          technicianId: technician?.id ?? null,
          ownerId: style.ownerId,
          orgId: style.orgId,
          customerId: style.customerId,
          createdBy: ctx.system ? null : ctx.userId,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
    )[0]!;
    await this.audit.log(ctx, { action: "sample.sample.create", objectType: "sample", objectId: created.id, docNo }, tx);
    emit({ type: "sample.sample.created", aggregateType: "sample", aggregateId: created.id, payload: { docNo, styleId: style.id, planningId: created.planningId } });
    await this.issueRound(ctx, tx, emit, created, style, { roundNo: 1, roundType: round.roundType, quantity: round.quantity, dueDate: round.dueDate });
    return created;
  }

  async update(ctx: AccessContext, id: string, input: z.infer<typeof sampleUpdateSchema>): Promise<SampleDetailDto> {
    await inTransaction(this.db, this.events, async (tx) => {
      const before = assertCanSee(ctx, (await tx.select().from(samples).where(eq(samples.id, id)))[0]);
      if (before.version !== input.version) throw versionConflict();
      const { version, ...patch } = input;
      const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) as Partial<SampleRow>;
      const updated = (await tx.update(samples).set({ ...clean, version: version + 1, updatedBy: ctx.userId, updatedAt: this.clock.now() }).where(and(eq(samples.id, id), eq(samples.version, version))).returning())[0];
      if (!updated) throw versionConflict();
      await this.audit.log(ctx, { action: "sample.sample.update", objectType: "sample", objectId: id, docNo: before.docNo, diff: diffOf(before as Record<string, unknown>, clean as Record<string, unknown>) }, tx);
    });
    return this.get(ctx, id);
  }

  async createRound(ctx: AccessContext, id: string, input: z.infer<typeof roundCreateSchema>): Promise<SampleDetailDto> {
    await inTransaction(this.db, this.events, async (tx, emit) => {
      const sample = assertCanSee(ctx, (await tx.select().from(samples).where(eq(samples.id, id)))[0]);
      if (sample.version !== input.version) throw versionConflict();
      const rounds = await tx.select().from(sampleRounds).where(eq(sampleRounds.sampleId, id)).orderBy(desc(sampleRounds.roundNo));
      const last = rounds[0];
      if (last && !TERMINAL.includes(last.status as RoundStatus)) throw new AppError(sampleErrors.SAMPLE_ROUND_OPEN);
      const style = assertFound((await tx.select().from(styles).where(eq(styles.id, sample.styleId)))[0]);
      const bumped = (await tx.update(samples).set({ version: sample.version + 1, updatedBy: ctx.userId, updatedAt: this.clock.now() }).where(and(eq(samples.id, id), eq(samples.version, input.version))).returning())[0];
      if (!bumped) throw versionConflict();
      await this.issueRound(ctx, tx, emit, sample, style, { roundNo: (last?.roundNo ?? 0) + 1, roundType: input.roundType, quantity: input.quantity, dueDate: input.dueDate ?? sample.dueDate, note: input.note ?? null });
    });
    return this.get(ctx, id);
  }

  async advance(ctx: AccessContext, roundId: string, input: z.infer<typeof roundAdvanceSchema>): Promise<SampleDetailDto> {
    if (input.to !== "AWAITING_APPROVAL") requirePermission(ctx, "sample.sample.advance");
    const sampleId = await inTransaction(this.db, this.events, async (tx, emit) => {
      const { round, sample } = await this.loadRound(ctx, tx, roundId);
      if (round.version !== input.version) throw versionConflict();
      const from = round.status as RoundStatus;
      if (!canTransition("sampleRound", from, input.to)) throw illegalTransition(from, input.to);
      const at = this.resolveAt(round, input.at);
      if (from === "SOURCING" && input.to === "KNITTING") {
        const pending = await tx.select().from(sampleMaterials).where(and(eq(sampleMaterials.sampleId, sample.id), eq(sampleMaterials.status, "PENDING")));
        if (pending.length) throw new AppError(sampleErrors.SAMPLE_MATERIALS_PENDING, { items: pending.map((m) => m.materialName).join("、") });
      }
      const rework = from === "QC" && input.to === "KNITTING";
      await this.moveRound(ctx, tx, emit, round, sample, input.to, { at, location: input.location ?? null, note: input.note ?? null, patch: rework ? { reworkCount: round.reworkCount + 1 } : {}, action: rework ? "rework" : "advance" });
      return sample.id;
    });
    return this.get(ctx, sampleId);
  }

  async approve(ctx: AccessContext, roundId: string, input: z.infer<typeof roundApproveSchema>): Promise<SampleDetailDto> {
    const sampleId = await inTransaction(this.db, this.events, async (tx, emit) => {
      const { round, sample } = await this.loadRound(ctx, tx, roundId);
      if (round.version !== input.version) throw versionConflict();
      const from = round.status as RoundStatus;
      if (!canTransition("sampleRound", from, input.result)) throw illegalTransition(from, input.result === "APPROVED" ? "approve" : "revise");
      const now = this.clock.now();
      const patch: Partial<RoundRow> = {
        approvalResult: input.result,
        approvalDate: input.approvalDate ?? this.clock.today(),
        approvalNote: input.note ?? null,
        approvedAt: input.result === "APPROVED" ? now : null,
      };
      await this.moveRound(ctx, tx, emit, round, sample, input.result, { at: now, location: null, note: input.note ?? null, patch, action: input.result === "APPROVED" ? "approve" : "revise" });
      if (input.result === "REVISE") {
        const style = assertFound((await tx.select().from(styles).where(eq(styles.id, sample.styleId)))[0]);
        await this.issueRound(ctx, tx, emit, sample, style, {
          roundNo: round.roundNo + 1,
          roundType: input.nextRoundType ?? (round.roundType as RoundType),
          quantity: input.nextQuantity ?? round.quantity,
          dueDate: sample.dueDate,
          note: input.note ?? null,
        });
      }
      return sample.id;
    });
    return this.get(ctx, sampleId);
  }

  private resolveAt(round: RoundRow, at: string | undefined): Date {
    const now = this.clock.now();
    if (!at) return now;
    const d = new Date(at);
    if (d.getTime() > now.getTime() || d.getTime() < round.stageEnteredAt.getTime()) throw new AppError(sampleErrors.SAMPLE_STAGE_TIME_INVALID);
    return d;
  }

  private async loadRound(ctx: AccessContext, tx: DbOrTx, roundId: string): Promise<{ round: RoundRow; sample: SampleRow }> {
    const round = assertFound((await tx.select().from(sampleRounds).where(eq(sampleRounds.id, roundId)))[0]);
    const sample = assertCanSee(ctx, (await tx.select().from(samples).where(eq(samples.id, round.sampleId)))[0]);
    return { round, sample };
  }

  private async issueRound(
    ctx: AccessContext,
    tx: DbOrTx,
    emit: Emit,
    sample: SampleRow,
    style: StyleRow,
    input: { roundNo: number; roundType: RoundType; quantity: number; dueDate: string | null; note?: string | null },
  ): Promise<RoundRow> {
    const now = this.clock.now();
    const round = (
      await tx
        .insert(sampleRounds)
        .values({
          sampleId: sample.id,
          roundNo: input.roundNo,
          roundType: input.roundType,
          quantity: input.quantity,
          status: "ISSUED",
          stageEnteredAt: now,
          issuedAt: now,
          dueDate: input.dueDate,
          reviseNote: input.note ?? null,
          createdBy: ctx.system ? null : ctx.userId,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
    )[0]!;
    await tx.insert(sampleStageLogs).values({ roundId: round.id, stage: "ISSUED", enteredAt: now, location: sample.location, factoryId: sample.factoryId, operatorId: ctx.system ? null : ctx.userId, note: input.note ?? null });
    const label = `${input.roundType} 第 ${input.roundNo} 轮`;
    if (sample.technicianId) {
      await this.todos.upsert(
        {
          fingerprint: `sample:round:${round.id}:receive`,
          source: "FLOW",
          action: "sample.round.receive",
          title: "接收打样指令",
          description: `#${style.styleNo} ${style.nameZh} · ${label}`,
          docType: "sample",
          docId: sample.id,
          docNo: sample.docNo,
          link: `/samples/${sample.id}`,
          customerId: sample.customerId,
          assigneeId: sample.technicianId,
          dueAt: new Date(now.getTime() + DAY),
        },
        tx,
      );
      await this.notifications.notify([sample.technicianId], { type: "sample.round.issued", title: `打样指令已下达：${sample.docNo} · ${label}`, body: `#${style.styleNo} ${style.nameZh}`, link: `/samples/${sample.id}` }, tx);
    }
    await this.audit.log(ctx, { action: "sample.round.issue", objectType: "sampleRound", objectId: round.id, docNo: sample.docNo, diff: { roundNo: input.roundNo, roundType: input.roundType } }, tx);
    emit({ type: "sample.round.issued", aggregateType: "sampleRound", aggregateId: round.id, payload: { sampleId: sample.id, styleId: sample.styleId, roundNo: input.roundNo, roundType: input.roundType } });
    return round;
  }

  private async moveRound(
    ctx: AccessContext,
    tx: DbOrTx,
    emit: Emit,
    round: RoundRow,
    sample: SampleRow,
    to: RoundStatus,
    opts: { at: Date; location: string | null; note: string | null; patch: Partial<RoundRow>; action: string },
  ): Promise<RoundRow> {
    const open = await tx.select().from(sampleStageLogs).where(and(eq(sampleStageLogs.roundId, round.id), isNull(sampleStageLogs.leftAt)));
    for (const l of open) {
      await tx
        .update(sampleStageLogs)
        .set({ leftAt: opts.at, durationHours: hoursBetween(l.enteredAt, opts.at) })
        .where(eq(sampleStageLogs.id, l.id));
    }
    const location = opts.location ?? (await this.defaultLocation(tx, sample));
    await tx.insert(sampleStageLogs).values({ roundId: round.id, stage: to, enteredAt: opts.at, location, factoryId: sample.factoryId, operatorId: ctx.system ? null : ctx.userId, note: opts.note });
    const updated = (
      await tx
        .update(sampleRounds)
        .set({ ...opts.patch, status: to, stageEnteredAt: opts.at, version: round.version + 1, updatedBy: ctx.system ? null : ctx.userId, updatedAt: this.clock.now() })
        .where(and(eq(sampleRounds.id, round.id), eq(sampleRounds.version, round.version)))
        .returning()
    )[0];
    if (!updated) throw versionConflict();
    if (round.status === "ISSUED") await this.todos.close(`sample:round:${round.id}:receive`, tx);
    if (round.status === "AWAITING_APPROVAL") await this.todos.close(`sample:round:${round.id}:approve`, tx);
    const label = `${round.roundType} 第 ${round.roundNo} 轮`;
    if (to === "AWAITING_APPROVAL") {
      await this.todos.upsert(
        {
          fingerprint: `sample:round:${round.id}:approve`,
          source: "FLOW",
          action: "sample.round.approve",
          title: "登记客户批复",
          description: `${sample.docNo} · ${label}`,
          docType: "sample",
          docId: sample.id,
          docNo: sample.docNo,
          link: `/samples/${sample.id}`,
          customerId: sample.customerId,
          assigneeId: sample.ownerId,
          dueAt: new Date(opts.at.getTime() + 5 * DAY),
        },
        tx,
      );
    }
    if (to === "READY") await this.notifications.notify([sample.ownerId], { type: "sample.round.ready", title: `样品待取样：${sample.docNo} · ${label}`, link: `/samples/${sample.id}` }, tx);
    await this.audit.log(ctx, { action: `sample.round.${opts.action}`, objectType: "sampleRound", objectId: round.id, docNo: sample.docNo, diff: { status: { from: round.status, to }, ...(opts.note ? { note: opts.note } : {}) } }, tx);
    const type = to === "APPROVED" ? "sample.round.approved" : to === "REVISE" ? "sample.round.revised" : "sample.round.advanced";
    emit({ type, aggregateType: "sampleRound", aggregateId: round.id, payload: { sampleId: sample.id, styleId: sample.styleId, from: round.status, to, roundType: round.roundType, roundNo: round.roundNo } });
    return updated;
  }

  private async defaultLocation(tx: DbOrTx, sample: SampleRow): Promise<string | null> {
    if (sample.location) return sample.location;
    if (!sample.factoryId) return null;
    const f = (await tx.select({ name: factories.name }).from(factories).where(eq(factories.id, sample.factoryId)))[0];
    return f ? `${f.name} · 打样中心` : null;
  }

  private async onShipmentSent(shipmentId: string, payload: Record<string, unknown>): Promise<void> {
    const items = Array.isArray(payload.items) ? (payload.items as { roundId?: unknown; styleId?: unknown }[]) : [];
    const styleOfRound = new Map(items.filter((i) => typeof i.roundId === "string").map((i) => [i.roundId as string, i.styleId]));
    const roundIds = [...styleOfRound.keys()];
    if (!roundIds.length) return;
    const ctx = systemContext();
    const docNo = typeof payload.docNo === "string" ? payload.docNo : null;
    await inTransaction(this.db, this.events, async (tx, emit) => {
      const rounds = await tx.select().from(sampleRounds).where(inArray(sampleRounds.id, roundIds));
      for (const r of rounds) {
        if (r.status !== "READY") continue;
        const sample = assertFound((await tx.select().from(samples).where(eq(samples.id, r.sampleId)))[0]);
        if (styleOfRound.get(r.id) !== sample.styleId) continue;
        const now = this.clock.now();
        const shipped = await this.moveRound(ctx, tx, emit, r, sample, "SHIPPED", { at: now, location: null, note: docNo, patch: { shipmentId, shipmentDocNo: docNo }, action: "ship" });
        await this.moveRound(ctx, tx, emit, shipped, sample, "AWAITING_APPROVAL", { at: now, location: null, note: null, patch: {}, action: "awaitApproval" });
      }
    });
  }

  async listLibrary(ctx: AccessContext, q: z.infer<typeof libraryListQuerySchema>): Promise<Page<LibraryItemDto>> {
    const conds: SQL[] = [scoped(sampleLibrary, ctx)];
    if (q.kind?.length) conds.push(inArray(sampleLibrary.kind, q.kind));
    if (q.status?.length) conds.push(inArray(sampleLibrary.status, q.status));
    if (q.customerId) conds.push(eq(sampleLibrary.customerId, q.customerId));
    if (q.styleId) conds.push(eq(sampleLibrary.styleId, q.styleId));
    const kw = likeKeyword(q.keyword);
    if (kw) {
      const styleIds = this.db.select({ id: styles.id }).from(styles).where(or(ilike(styles.styleNo, kw), ilike(styles.nameZh, kw)));
      conds.push(or(ilike(sampleLibrary.location, kw), inArray(sampleLibrary.styleId, styleIds))!);
    }
    const where = and(...conds);
    return paginate(
      q,
      async () => (await this.db.select({ n: countAll }).from(sampleLibrary).where(where))[0]!.n,
      async (limit, offset) => this.toLibrary(await this.db.select().from(sampleLibrary).where(where).orderBy(desc(sampleLibrary.createdAt)).limit(limit).offset(offset)),
    );
  }

  async upsertLibrary(ctx: AccessContext, id: string | null, input: z.infer<typeof libraryUpsertSchema>): Promise<LibraryItemDto> {
    const row = await inTransaction(this.db, this.events, async (tx) => {
      const style = assertCanSee(ctx, (await tx.select().from(styles).where(eq(styles.id, input.styleId)))[0]);
      if (input.sampleId) {
        const sample = assertCanSee(ctx, (await tx.select().from(samples).where(eq(samples.id, input.sampleId)))[0]);
        if (sample.styleId !== style.id) throw new AppError(sampleErrors.SAMPLE_STYLE_MISMATCH);
      }
      if (input.roundId) {
        const round = assertFound((await tx.select().from(sampleRounds).where(eq(sampleRounds.id, input.roundId)))[0]);
        if (input.sampleId && round.sampleId !== input.sampleId) throw new AppError(sampleErrors.SAMPLE_STYLE_MISMATCH);
      }
      const data = { styleId: style.id, sampleId: input.sampleId ?? null, roundId: input.roundId ?? null, kind: input.kind, location: input.location ?? null, quantity: input.quantity, note: input.note ?? null };
      const now = this.clock.now();
      if (!id) {
        const created = (await tx.insert(sampleLibrary).values({ ...data, ownerId: style.ownerId, orgId: style.orgId, customerId: style.customerId, createdBy: ctx.userId, createdAt: now, updatedAt: now }).returning())[0]!;
        await this.audit.log(ctx, { action: "sample.library.create", objectType: "sampleLibrary", objectId: created.id, diff: { kind: input.kind, styleNo: style.styleNo } }, tx);
        return created;
      }
      const before = assertCanSee(ctx, (await tx.select().from(sampleLibrary).where(eq(sampleLibrary.id, id)))[0]);
      if (input.version !== undefined && input.version !== before.version) throw versionConflict();
      const updated = (await tx.update(sampleLibrary).set({ ...data, version: before.version + 1, updatedBy: ctx.userId, updatedAt: now }).where(and(eq(sampleLibrary.id, id), eq(sampleLibrary.version, before.version))).returning())[0];
      if (!updated) throw versionConflict();
      await this.audit.log(ctx, { action: "sample.library.update", objectType: "sampleLibrary", objectId: id, diff: diffOf(before as Record<string, unknown>, data as Record<string, unknown>) }, tx);
      return updated;
    });
    return (await this.toLibrary([row]))[0]!;
  }

  async lendLibrary(ctx: AccessContext, id: string, input: { borrower: string; note?: string | null; version: number }): Promise<LibraryItemDto> {
    return this.libraryTransition(ctx, id, input.version, "IN_STOCK", { status: "LENT", borrower: input.borrower, lentAt: this.clock.now(), returnedAt: null, ...(input.note ? { note: input.note } : {}) }, "lend");
  }

  async returnLibrary(ctx: AccessContext, id: string, input: { location?: string | null; version: number }): Promise<LibraryItemDto> {
    return this.libraryTransition(ctx, id, input.version, "LENT", { status: "IN_STOCK", returnedAt: this.clock.now(), ...(input.location ? { location: input.location } : {}) }, "return");
  }

  private async libraryTransition(ctx: AccessContext, id: string, version: number, from: string, patch: Partial<LibraryRow>, action: string): Promise<LibraryItemDto> {
    const row = await this.db.transaction(async (tx) => {
      const before = assertCanSee(ctx, (await tx.select().from(sampleLibrary).where(eq(sampleLibrary.id, id)))[0]);
      if (before.version !== version) throw versionConflict();
      if (before.status !== from) throw new AppError(sampleErrors.SAMPLE_LIBRARY_STATUS, { status: before.status });
      const updated = (await tx.update(sampleLibrary).set({ ...patch, version: version + 1, updatedBy: ctx.userId, updatedAt: this.clock.now() }).where(and(eq(sampleLibrary.id, id), eq(sampleLibrary.version, version))).returning())[0];
      if (!updated) throw versionConflict();
      await this.audit.log(ctx, { action: `sample.library.${action}`, objectType: "sampleLibrary", objectId: id, diff: { status: { from: before.status, to: patch.status } } }, tx);
      return updated;
    });
    return (await this.toLibrary([row]))[0]!;
  }

  async listMaterials(ctx: AccessContext, q: z.infer<typeof materialListQuerySchema>): Promise<Page<MaterialDto>> {
    const conds: SQL[] = [scoped(samples, ctx)];
    if (q.sampleId) conds.push(eq(sampleMaterials.sampleId, q.sampleId));
    if (q.status?.length) conds.push(inArray(sampleMaterials.status, q.status));
    if (q.customerId) conds.push(eq(samples.customerId, q.customerId));
    const kw = likeKeyword(q.keyword);
    if (kw) conds.push(or(ilike(sampleMaterials.materialName, kw), ilike(sampleMaterials.spec, kw), ilike(samples.docNo, kw), ilike(sampleMaterials.supplier, kw))!);
    const where = and(...conds);
    return paginate(
      q,
      async () => (await this.db.select({ n: countAll }).from(sampleMaterials).innerJoin(samples, eq(samples.id, sampleMaterials.sampleId)).where(where))[0]!.n,
      async (limit, offset) => {
        const rows = await this.db
          .select({ m: sampleMaterials })
          .from(sampleMaterials)
          .innerJoin(samples, eq(samples.id, sampleMaterials.sampleId))
          .where(where)
          .orderBy(asc(sampleMaterials.status), asc(sampleMaterials.arrivalDate), desc(sampleMaterials.createdAt))
          .limit(limit)
          .offset(offset);
        return this.toMaterials(rows.map((r) => r.m));
      },
    );
  }

  async upsertMaterial(ctx: AccessContext, id: string | null, input: z.infer<typeof materialUpsertSchema>): Promise<MaterialDto> {
    const row = await this.db.transaction(async (tx) => {
      const sample = assertCanSee(ctx, (await tx.select().from(samples).where(eq(samples.id, input.sampleId)))[0]);
      const data = { sampleId: sample.id, materialName: input.materialName, spec: input.spec ?? null, quantity: input.quantity ?? null, unit: input.unit ?? null, supplier: input.supplier ?? null, arrivalDate: input.arrivalDate ?? null, note: input.note ?? null };
      const now = this.clock.now();
      if (!id) {
        const created = (await tx.insert(sampleMaterials).values({ ...data, status: "PENDING", createdBy: ctx.userId, createdAt: now, updatedAt: now }).returning())[0]!;
        await this.audit.log(ctx, { action: "sample.material.create", objectType: "sampleMaterial", objectId: created.id, docNo: sample.docNo }, tx);
        return created;
      }
      const before = assertFound((await tx.select().from(sampleMaterials).where(eq(sampleMaterials.id, id)))[0]);
      if (before.sampleId !== sample.id) throw notFound();
      if (input.version !== undefined && input.version !== before.version) throw versionConflict();
      const updated = (await tx.update(sampleMaterials).set({ ...data, version: before.version + 1, updatedBy: ctx.userId, updatedAt: now }).where(and(eq(sampleMaterials.id, id), eq(sampleMaterials.version, before.version))).returning())[0];
      if (!updated) throw versionConflict();
      await this.audit.log(ctx, { action: "sample.material.update", objectType: "sampleMaterial", objectId: id, docNo: sample.docNo, diff: diffOf(before as Record<string, unknown>, data as Record<string, unknown>) }, tx);
      return updated;
    });
    return (await this.toMaterials([row]))[0]!;
  }

  async arriveMaterial(ctx: AccessContext, id: string, input: { arrivedAt?: string; version: number }): Promise<MaterialDto> {
    const row = await this.db.transaction(async (tx) => {
      const before = assertFound((await tx.select().from(sampleMaterials).where(eq(sampleMaterials.id, id)))[0]);
      const sample = assertCanSee(ctx, (await tx.select().from(samples).where(eq(samples.id, before.sampleId)))[0]);
      if (before.version !== input.version) throw versionConflict();
      if (before.status !== "PENDING") throw illegalTransition(before.status, "arrive");
      const arrivedAt = input.arrivedAt ? new Date(input.arrivedAt) : this.clock.now();
      const updated = (
        await tx
          .update(sampleMaterials)
          .set({ status: "ARRIVED", arrivedAt, arrivalDate: before.arrivalDate ?? arrivedAt.toISOString().slice(0, 10), version: before.version + 1, updatedBy: ctx.userId, updatedAt: this.clock.now() })
          .where(and(eq(sampleMaterials.id, id), eq(sampleMaterials.version, input.version)))
          .returning()
      )[0];
      if (!updated) throw versionConflict();
      await this.audit.log(ctx, { action: "sample.material.arrive", objectType: "sampleMaterial", objectId: id, docNo: sample.docNo }, tx);
      return updated;
    });
    return (await this.toMaterials([row]))[0]!;
  }

  private async lookups(sampleRows: { styleId: string; customerId: string; ownerId: string; technicianId?: string | null; factoryId?: string | null; planningId?: string | null }[]) {
    const uniq = <T>(xs: (T | null | undefined)[]) => [...new Set(xs.filter((x): x is T => x !== null && x !== undefined))];
    const styleIds = uniq(sampleRows.map((r) => r.styleId));
    const custIds = uniq(sampleRows.map((r) => r.customerId));
    const userIds = uniq(sampleRows.flatMap((r) => [r.ownerId, r.technicianId]));
    const factoryIds = uniq(sampleRows.map((r) => r.factoryId));
    const planningIds = uniq(sampleRows.map((r) => r.planningId));
    const [styleRows, custRows, userRows, factoryRows, planningRows] = await Promise.all([
      styleIds.length ? this.db.select().from(styles).where(inArray(styles.id, styleIds)) : [],
      custIds.length ? this.db.select({ id: customers.id, name: customers.name }).from(customers).where(inArray(customers.id, custIds)) : [],
      userIds.length ? this.db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, userIds)) : [],
      factoryIds.length ? this.db.select({ id: factories.id, name: factories.name }).from(factories).where(inArray(factories.id, factoryIds)) : [],
      planningIds.length ? this.db.select({ id: plannings.id, docNo: plannings.docNo }).from(plannings).where(inArray(plannings.id, planningIds)) : [],
    ]);
    return {
      style: new Map(styleRows.map((s) => [s.id, s])),
      customer: new Map(custRows.map((c) => [c.id, c.name])),
      user: new Map(userRows.map((u) => [u.id, u.name])),
      factory: new Map(factoryRows.map((f) => [f.id, f.name])),
      planning: new Map(planningRows.map((p) => [p.id, p.docNo])),
    };
  }

  private summaryOf(r: SampleRow, l: Awaited<ReturnType<SampleService["lookups"]>>, current: SampleSummaryDto["currentRound"]): SampleSummaryDto {
    const style = l.style.get(r.styleId);
    return {
      id: r.id,
      docNo: r.docNo,
      styleId: r.styleId,
      styleNo: style?.styleNo ?? "",
      styleNameZh: style?.nameZh ?? "",
      styleNameEn: style?.nameEn ?? null,
      productCode: r.productCode ?? style?.productCode ?? null,
      seasonCode: style?.seasonCode ?? null,
      customerId: r.customerId,
      customerName: l.customer.get(r.customerId) ?? "",
      planningId: r.planningId,
      planningDocNo: r.planningId ? (l.planning.get(r.planningId) ?? null) : null,
      factoryId: r.factoryId,
      factoryName: r.factoryId ? (l.factory.get(r.factoryId) ?? null) : null,
      dueDate: r.dueDate,
      remainingDays: remainingDays(r.dueDate, this.clock.today()),
      currentRound: current,
      costStatus: r.costStatus,
      ownerId: r.ownerId,
      ownerName: l.user.get(r.ownerId) ?? "",
      technicianId: r.technicianId,
      technicianName: r.technicianId ? (l.user.get(r.technicianId) ?? null) : null,
      createdAt: r.createdAt.toISOString(),
      version: r.version,
    };
  }

  private async toSummaries(rows: SampleRow[]): Promise<SampleSummaryDto[]> {
    if (!rows.length) return [];
    const l = await this.lookups(rows);
    const rounds = await currentRounds(this.db, rows.map((r) => r.id));
    const logs = rounds.length ? await this.db.select().from(sampleStageLogs).where(inArray(sampleStageLogs.roundId, rounds.map((r) => r.id))) : [];
    const now = this.clock.now();
    const avg = await loadAverages(this.db, now, rounds.map((r) => r.id));
    return rows.map((r) => {
      const round = rounds.find((x) => x.sampleId === r.id);
      let current: SampleSummaryDto["currentRound"] = null;
      if (round) {
        const status = round.status as RoundStatus;
        const stages = buildStages(status, logs.filter((x) => x.roundId === round.id), r.factoryId, avg, now, new Map());
        current = { id: round.id, roundNo: round.roundNo, roundType: round.roundType as RoundType, status, stageIndex: STAGE_INDEX[status], reworkCount: round.reworkCount, progress: progressOf(status, stages, round.dueDate ?? r.dueDate, now), version: round.version };
      }
      return this.summaryOf(r, l, current);
    });
  }

  private async toDetail(ctx: AccessContext, r: SampleRow): Promise<SampleDetailDto> {
    const l = await this.lookups([r]);
    const rounds = await this.db.select().from(sampleRounds).where(eq(sampleRounds.sampleId, r.id)).orderBy(asc(sampleRounds.roundNo));
    const logs = rounds.length ? await this.db.select().from(sampleStageLogs).where(inArray(sampleStageLogs.roundId, rounds.map((x) => x.id))).orderBy(asc(sampleStageLogs.enteredAt)) : [];
    const operatorIds = [...new Set(logs.map((x) => x.operatorId).filter((x): x is string => !!x))];
    const operators = new Map(operatorIds.length ? (await this.db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, operatorIds))).map((u) => [u.id, u.name]) : []);
    const now = this.clock.now();
    const avg = await loadAverages(this.db, now, rounds.map((x) => x.id));
    const roundDtos: RoundDto[] = rounds.map((round) => this.roundDto(round, r, logs.filter((x) => x.roundId === round.id), avg, now, operators));
    const last = roundDtos[roundDtos.length - 1];
    const current: SampleSummaryDto["currentRound"] = last
      ? { id: last.id, roundNo: last.roundNo, roundType: last.roundType, status: last.status, stageIndex: last.stageIndex, reworkCount: last.reworkCount, progress: last.progress, version: last.version }
      : null;
    const team = r.teamOrgId ? (await this.db.select({ name: orgs.name }).from(orgs).where(eq(orgs.id, r.teamOrgId)))[0] : undefined;
    const materials = await this.toMaterials(await this.db.select().from(sampleMaterials).where(eq(sampleMaterials.sampleId, r.id)).orderBy(asc(sampleMaterials.createdAt)));
    const library = await this.toLibrary(await this.db.select().from(sampleLibrary).where(and(eq(sampleLibrary.sampleId, r.id), scoped(sampleLibrary, ctx))).orderBy(desc(sampleLibrary.createdAt)));
    const style = l.style.get(r.styleId);
    return {
      ...this.summaryOf(r, l, current),
      teamOrgId: r.teamOrgId,
      teamOrgName: team?.name ?? null,
      location: r.location,
      colorway: r.colorway,
      size: r.size,
      customerRef: r.customerRef,
      briefTranslation: r.briefTranslation,
      yarnConfig: r.yarnConfig,
      craftNotes: r.craftNotes,
      sampleNotes: r.sampleNotes,
      styleImageFileId: style?.imageFileId ?? null,
      rounds: roundDtos,
      materials,
      library,
    };
  }

  private roundDto(round: RoundRow, sample: SampleRow, logs: LogRow[], avg: Awaited<ReturnType<typeof loadAverages>>, now: Date, operators: Map<string, string>): RoundDto {
    const status = round.status as RoundStatus;
    const stages = buildStages(status, logs, sample.factoryId, avg, now, operators);
    const due = round.dueDate ?? sample.dueDate;
    return {
      id: round.id,
      sampleId: round.sampleId,
      roundNo: round.roundNo,
      roundType: round.roundType as RoundType,
      quantity: round.quantity,
      status,
      stageIndex: STAGE_INDEX[status],
      stageEnteredAt: round.stageEnteredAt.toISOString(),
      reworkCount: round.reworkCount,
      dueDate: due,
      remainingDays: remainingDays(due, this.clock.today()),
      issuedAt: iso(round.issuedAt),
      approvalResult: (round.approvalResult as RoundDto["approvalResult"]) ?? null,
      approvalDate: round.approvalDate,
      approvalNote: round.approvalNote,
      reviseNote: round.reviseNote,
      shipmentId: round.shipmentId,
      shipmentDocNo: round.shipmentDocNo,
      progress: progressOf(status, stages, due, now),
      stages,
      logs: logs.map((x) => ({
        id: x.id,
        stage: x.stage,
        enteredAt: x.enteredAt.toISOString(),
        leftAt: iso(x.leftAt),
        durationHours: x.leftAt ? (x.durationHours ?? hoursBetween(x.enteredAt, x.leftAt)) : null,
        location: x.location,
        operatorName: x.operatorId ? (operators.get(x.operatorId) ?? null) : null,
        note: x.note,
      })),
      version: round.version,
    };
  }

  private async toMaterials(rows: MaterialRow[]): Promise<MaterialDto[]> {
    if (!rows.length) return [];
    const sampleRows = await this.db.select().from(samples).where(inArray(samples.id, [...new Set(rows.map((r) => r.sampleId))]));
    const l = await this.lookups(sampleRows);
    const today = this.clock.today();
    return rows.map((m) => {
      const s = sampleRows.find((x) => x.id === m.sampleId);
      return {
        id: m.id,
        sampleId: m.sampleId,
        sampleDocNo: s?.docNo ?? "",
        styleNo: s ? (l.style.get(s.styleId)?.styleNo ?? "") : "",
        customerName: s ? (l.customer.get(s.customerId) ?? "") : "",
        materialName: m.materialName,
        spec: m.spec,
        quantity: m.quantity,
        unit: m.unit,
        supplier: m.supplier,
        arrivalDate: m.arrivalDate,
        arrivedAt: iso(m.arrivedAt),
        status: m.status as MaterialDto["status"],
        overdue: m.status === "PENDING" && !!m.arrivalDate && m.arrivalDate < today,
        note: m.note,
        version: m.version,
      };
    });
  }

  private async toLibrary(rows: LibraryRow[]): Promise<LibraryItemDto[]> {
    if (!rows.length) return [];
    const l = await this.lookups(rows.map((r) => ({ styleId: r.styleId, customerId: r.customerId, ownerId: r.ownerId })));
    const sampleIds = [...new Set(rows.map((r) => r.sampleId).filter((x): x is string => !!x))];
    const roundIds = [...new Set(rows.map((r) => r.roundId).filter((x): x is string => !!x))];
    const sampleNos = new Map(sampleIds.length ? (await this.db.select({ id: samples.id, docNo: samples.docNo }).from(samples).where(inArray(samples.id, sampleIds))).map((s) => [s.id, s.docNo]) : []);
    const roundLabels = new Map(
      roundIds.length ? (await this.db.select().from(sampleRounds).where(inArray(sampleRounds.id, roundIds))).map((r) => [r.id, `${r.roundType} 第 ${r.roundNo} 轮`]) : [],
    );
    return rows.map((r) => {
      const style = l.style.get(r.styleId);
      return {
        id: r.id,
        styleId: r.styleId,
        styleNo: style?.styleNo ?? "",
        styleNameZh: style?.nameZh ?? "",
        customerId: r.customerId,
        customerName: l.customer.get(r.customerId) ?? "",
        sampleId: r.sampleId,
        sampleDocNo: r.sampleId ? (sampleNos.get(r.sampleId) ?? null) : null,
        roundId: r.roundId,
        roundLabel: r.roundId ? (roundLabels.get(r.roundId) ?? null) : null,
        kind: r.kind as LibraryItemDto["kind"],
        location: r.location,
        quantity: r.quantity,
        status: r.status as LibraryItemDto["status"],
        borrower: r.borrower,
        lentAt: iso(r.lentAt),
        returnedAt: iso(r.returnedAt),
        note: r.note,
        createdAt: r.createdAt.toISOString(),
        version: r.version,
      };
    });
  }
}

