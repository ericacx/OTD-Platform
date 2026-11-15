import { Inject, Injectable, type OnModuleInit } from "@nestjs/common";
import type { Page } from "@otd/contracts/common";
import {
  type AuditResult,
  type AuditStatus,
  type AuditType,
  type FactoryAuditDetailDto,
  type FactoryAuditDto,
  type FindingDto,
  type auditCreateSchema,
  type auditListQuerySchema,
  type auditRecordSchema,
  type auditUpdateSchema,
  type findingCreateSchema,
  type findingListQuerySchema,
  type findingUpdateSchema,
  factoryauditErrors,
} from "@otd/contracts/factoryaudit";
import { type Database, type DbOrTx, auditFindings, bases, customerOrders, customers, factories, factoryAudits, roles, userRoles, users } from "@otd/db";
import { canTransition } from "@otd/shared";
import { type SQL, and, asc, desc, eq, gte, ilike, inArray, isNull, lt, lte, ne, or, sql } from "drizzle-orm";
import type { z } from "zod";
import { type AccessContext, canSeeCustomer } from "../../core/access/access.types.js";
import { assertCanSee, ownership, scoped } from "../../core/access/scope.js";
import { AuditService, diffOf } from "../../core/audit.service.js";
import { Clock } from "../../core/clock.js";
import { AppError, illegalTransition, notFound, versionConflict } from "../../core/errors.js";
import { EventBus, inTransaction } from "../../core/events.js";
import { NumberingService } from "../../core/numbering.service.js";
import { countAll, iso, likeKeyword, paginate } from "../../core/paging.js";
import { Scheduler } from "../../core/scheduler.js";
import { DB } from "../../core/tokens.js";
import { TodoService } from "../todo/todo.service.js";

type AuditRow = typeof factoryAudits.$inferSelect;
type FindingRow = typeof auditFindings.$inferSelect;

const PLAN_STATUSES: AuditStatus[] = ["PLANNED", "IN_PROGRESS"];
const RECORD_STATUSES: AuditStatus[] = ["RECTIFYING", "CLOSED"];
const QUALITY_ROLE = "R005";
const DAY = 86_400_000;

@Injectable()
export class FactoryAuditService implements OnModuleInit {
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
    this.scheduler.register({ name: "factoryaudit.overdue-findings", dailyAt: "07:30", run: () => this.scanOverdueFindings() });
  }

  async listPlans(ctx: AccessContext, q: z.infer<typeof auditListQuerySchema>): Promise<Page<FactoryAuditDto>> {
    return this.list(ctx, q, PLAN_STATUSES, [asc(factoryAudits.plannedDate), asc(factoryAudits.docNo)]);
  }

  async listRecords(ctx: AccessContext, q: z.infer<typeof auditListQuerySchema>): Promise<Page<FactoryAuditDto>> {
    return this.list(ctx, q, RECORD_STATUSES, [desc(factoryAudits.actualDate), desc(factoryAudits.docNo)]);
  }

  async listFindings(ctx: AccessContext, q: z.infer<typeof findingListQuerySchema>): Promise<Page<FindingDto>> {
    const today = this.clock.today();
    const conds: SQL[] = [scoped(factoryAudits, ctx)];
    if (q.status) conds.push(eq(auditFindings.status, q.status));
    if (q.severity) conds.push(eq(auditFindings.severity, q.severity));
    if (q.auditId) conds.push(eq(auditFindings.auditId, q.auditId));
    if (q.factoryId) conds.push(eq(factoryAudits.factoryId, q.factoryId));
    if (q.overdue === "true") conds.push(eq(auditFindings.status, "OPEN"), lt(auditFindings.dueDate, today));
    if (q.overdue === "false") conds.push(or(ne(auditFindings.status, "OPEN"), isNull(auditFindings.dueDate), gte(auditFindings.dueDate, today))!);
    const kw = likeKeyword(q.keyword);
    if (kw) conds.push(or(ilike(auditFindings.item, kw), ilike(auditFindings.responsible, kw), ilike(factoryAudits.docNo, kw))!);
    const where = and(...conds);
    return paginate(
      q,
      async () => (await this.db.select({ n: countAll }).from(auditFindings).innerJoin(factoryAudits, eq(factoryAudits.id, auditFindings.auditId)).where(where))[0]!.n,
      async (limit, offset) => {
        const rows = await this.db
          .select({ f: auditFindings, a: factoryAudits })
          .from(auditFindings)
          .innerJoin(factoryAudits, eq(factoryAudits.id, auditFindings.auditId))
          .where(where)
          .orderBy(sql`case when ${auditFindings.status} = 'OPEN' then 0 else 1 end`, sql`${auditFindings.dueDate} asc nulls last`, asc(auditFindings.createdAt))
          .limit(limit)
          .offset(offset);
        return this.toFindingDtos(rows);
      },
    );
  }

  async get(ctx: AccessContext, id: string): Promise<FactoryAuditDetailDto> {
    const row = assertCanSee(ctx, (await this.db.select().from(factoryAudits).where(eq(factoryAudits.id, id)))[0]);
    const [dto] = await this.toDtos([row]);
    const findings = await this.db.select().from(auditFindings).where(eq(auditFindings.auditId, id)).orderBy(asc(auditFindings.createdAt));
    return { ...dto!, findings: await this.toFindingDtos(findings.map((f) => ({ f, a: row }))) };
  }

  async create(ctx: AccessContext, input: z.infer<typeof auditCreateSchema>): Promise<FactoryAuditDetailDto> {
    const row = await inTransaction(this.db, this.events, async (tx, emit) => {
      const customerId = await this.resolveCustomer(ctx, tx, input.factoryId, input.customerId);
      const docNo = await this.numbering.next("factoryAudit", tx);
      const created = (
        await tx
          .insert(factoryAudits)
          .values({
            docNo,
            factoryId: input.factoryId,
            auditType: input.auditType,
            plannedDate: input.plannedDate,
            auditor: input.auditor ?? null,
            status: "PLANNED",
            note: input.note ?? null,
            ...ownership(ctx, customerId),
            createdBy: ctx.userId,
          })
          .returning()
      )[0]!;
      await this.audit.log(ctx, { action: "factoryaudit.audit.create", objectType: "factoryAudit", objectId: created.id, docNo }, tx);
      emit({ type: "factoryaudit.audit.created", aggregateType: "factoryAudit", aggregateId: created.id, payload: { docNo, factoryId: input.factoryId } });
      return created;
    });
    return this.get(ctx, row.id);
  }

  async update(ctx: AccessContext, id: string, input: z.infer<typeof auditUpdateSchema>): Promise<FactoryAuditDetailDto> {
    await inTransaction(this.db, this.events, async (tx) => {
      const before = assertCanSee(ctx, (await tx.select().from(factoryAudits).where(eq(factoryAudits.id, id)))[0]);
      if (before.version !== input.version) throw versionConflict();
      if (before.status === "CLOSED") throw illegalTransition(before.status, "edit");
      const customerId = input.factoryId !== before.factoryId || (input.customerId && input.customerId !== before.customerId) ? await this.resolveCustomer(ctx, tx, input.factoryId, input.customerId ?? before.customerId) : before.customerId;
      const patch = { factoryId: input.factoryId, auditType: input.auditType, plannedDate: input.plannedDate, auditor: input.auditor ?? null, note: input.note ?? null, customerId };
      const updated = await tx.update(factoryAudits).set({ ...patch, version: before.version + 1, updatedBy: ctx.userId }).where(and(eq(factoryAudits.id, id), eq(factoryAudits.version, input.version))).returning();
      if (!updated.length) throw versionConflict();
      await this.audit.log(ctx, { action: "factoryaudit.audit.update", objectType: "factoryAudit", objectId: id, docNo: before.docNo, diff: diffOf(before, patch) }, tx);
    });
    return this.get(ctx, id);
  }

  async start(ctx: AccessContext, id: string, input: { actualDate?: string; version: number }): Promise<FactoryAuditDetailDto> {
    await inTransaction(this.db, this.events, async (tx, emit) => {
      const before = await this.lockForAction(ctx, tx, id, input.version);
      this.assertTransition(before, "IN_PROGRESS", "start");
      await this.applyStatus(ctx, tx, before, "IN_PROGRESS", "start", { actualDate: input.actualDate ?? before.actualDate ?? this.clock.today() });
      emit({ type: "factoryaudit.audit.started", aggregateType: "factoryAudit", aggregateId: id, payload: { docNo: before.docNo } });
    });
    return this.get(ctx, id);
  }

  async record(ctx: AccessContext, id: string, input: z.infer<typeof auditRecordSchema>): Promise<FactoryAuditDetailDto> {
    await inTransaction(this.db, this.events, async (tx, emit) => {
      const before = await this.lockForAction(ctx, tx, id, input.version);
      if (before.status !== "IN_PROGRESS") throw illegalTransition(before.status, "record");
      const open = await this.openFindingCount(tx, id);
      const to: AuditStatus = open > 0 ? "RECTIFYING" : "CLOSED";
      this.assertTransition(before, to, "record");
      await this.applyStatus(ctx, tx, before, to, "record", {
        actualDate: input.actualDate,
        result: input.result,
        score: input.score ?? null,
        certificateValidUntil: input.certificateValidUntil ?? null,
        ...(input.auditor !== undefined ? { auditor: input.auditor } : {}),
        ...(input.note !== undefined ? { note: input.note } : {}),
      });
      emit({ type: "factoryaudit.audit.recorded", aggregateType: "factoryAudit", aggregateId: id, payload: { docNo: before.docNo, result: input.result, status: to, openFindings: open } });
    });
    return this.get(ctx, id);
  }

  async close(ctx: AccessContext, id: string, input: { note?: string; version: number }): Promise<FactoryAuditDetailDto> {
    await inTransaction(this.db, this.events, async (tx, emit) => {
      const before = await this.lockForAction(ctx, tx, id, input.version);
      this.assertTransition(before, "CLOSED", "close");
      if (!before.result) throw new AppError(factoryauditErrors.FACTORYAUDIT_RESULT_REQUIRED);
      const open = await this.openFindingCount(tx, id);
      if (open > 0) throw new AppError(factoryauditErrors.FACTORYAUDIT_OPEN_FINDINGS, { count: open });
      await this.applyStatus(ctx, tx, before, "CLOSED", "close", input.note ? { note: input.note } : {});
      emit({ type: "factoryaudit.audit.closed", aggregateType: "factoryAudit", aggregateId: id, payload: { docNo: before.docNo } });
    });
    return this.get(ctx, id);
  }

  async addFinding(ctx: AccessContext, auditId: string, input: z.infer<typeof findingCreateSchema>): Promise<FindingDto> {
    const finding = await inTransaction(this.db, this.events, async (tx, emit) => {
      const audit = assertCanSee(ctx, (await tx.select().from(factoryAudits).where(eq(factoryAudits.id, auditId)))[0]);
      if (audit.status !== "IN_PROGRESS" && audit.status !== "RECTIFYING") throw illegalTransition(audit.status, "addFinding");
      const created = (
        await tx
          .insert(auditFindings)
          .values({ auditId, item: input.item, severity: input.severity, correctiveAction: input.correctiveAction ?? null, responsible: input.responsible ?? null, dueDate: input.dueDate ?? null, status: "OPEN", createdBy: ctx.userId })
          .returning()
      )[0]!;
      await this.audit.log(ctx, { action: "factoryaudit.finding.create", objectType: "auditFinding", objectId: created.id, docNo: audit.docNo, diff: { item: input.item, severity: input.severity } }, tx);
      emit({ type: "factoryaudit.finding.created", aggregateType: "factoryAudit", aggregateId: auditId, payload: { findingId: created.id, docNo: audit.docNo } });
      return created;
    });
    return this.findingDto(ctx, finding.id);
  }

  async updateFinding(ctx: AccessContext, id: string, input: z.infer<typeof findingUpdateSchema>): Promise<FindingDto> {
    await inTransaction(this.db, this.events, async (tx) => {
      const { f, a } = await this.findingWithAudit(ctx, tx, id);
      if (f.version !== input.version) throw versionConflict();
      if (f.status !== "OPEN") throw new AppError(factoryauditErrors.FACTORYAUDIT_FINDING_CLOSED);
      const patch = { item: input.item, severity: input.severity, correctiveAction: input.correctiveAction ?? null, responsible: input.responsible ?? null, dueDate: input.dueDate ?? null };
      const updated = await tx.update(auditFindings).set({ ...patch, version: f.version + 1, updatedBy: ctx.userId }).where(and(eq(auditFindings.id, id), eq(auditFindings.version, input.version))).returning();
      if (!updated.length) throw versionConflict();
      if (!patch.dueDate || patch.dueDate >= this.clock.today()) await this.todos.closeByPrefix(`factoryaudit:finding:${id}:`, tx);
      await this.audit.log(ctx, { action: "factoryaudit.finding.update", objectType: "auditFinding", objectId: id, docNo: a.docNo, diff: diffOf(f, patch) }, tx);
    });
    return this.findingDto(ctx, id);
  }

  async closeFinding(ctx: AccessContext, id: string, input: { closeNote?: string; version: number }): Promise<FindingDto> {
    await inTransaction(this.db, this.events, async (tx, emit) => {
      const { f, a } = await this.findingWithAudit(ctx, tx, id);
      if (f.version !== input.version) throw versionConflict();
      if (f.status !== "OPEN") throw new AppError(factoryauditErrors.FACTORYAUDIT_FINDING_CLOSED);
      const updated = await tx
        .update(auditFindings)
        .set({ status: "CLOSED", closedAt: this.clock.now(), closeNote: input.closeNote ?? null, version: f.version + 1, updatedBy: ctx.userId })
        .where(and(eq(auditFindings.id, id), eq(auditFindings.version, input.version)))
        .returning();
      if (!updated.length) throw versionConflict();
      await this.todos.closeByPrefix(`factoryaudit:finding:${id}:`, tx);
      await this.audit.log(ctx, { action: "factoryaudit.finding.close", objectType: "auditFinding", objectId: id, docNo: a.docNo, diff: { status: { from: "OPEN", to: "CLOSED" } } }, tx);
      emit({ type: "factoryaudit.finding.closed", aggregateType: "factoryAudit", aggregateId: a.id, payload: { findingId: id, docNo: a.docNo } });
    });
    return this.findingDto(ctx, id);
  }

  async scanOverdueFindings(): Promise<{ todos: number }> {
    const today = this.clock.today();
    const rows = await this.db
      .select({ f: auditFindings, a: factoryAudits })
      .from(auditFindings)
      .innerJoin(factoryAudits, eq(factoryAudits.id, auditFindings.auditId))
      .where(and(eq(auditFindings.status, "OPEN"), lt(auditFindings.dueDate, today), ne(factoryAudits.status, "CLOSED")));
    if (!rows.length) return { todos: 0 };
    const quality = await this.db
      .select({ id: users.id })
      .from(userRoles)
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .innerJoin(users, eq(users.id, userRoles.userId))
      .where(and(eq(roles.code, QUALITY_ROLE), eq(users.status, "ACTIVE")));
    let count = 0;
    await this.db.transaction(async (tx) => {
      for (const { f, a } of rows) {
        const inspectors = [...new Set(quality.map((u) => u.id))];
        const assignees = inspectors.length ? inspectors : [a.ownerId];
        for (const assigneeId of assignees) {
          await this.todos.upsert(
            {
              fingerprint: `factoryaudit:finding:${f.id}:${assigneeId}`,
              source: "FLOW",
              action: "factoryaudit.finding.overdue",
              title: `整改项到期未关闭：${f.item}`,
              description: `${a.docNo}${f.responsible ? ` · ${f.responsible}` : ""}`,
              docType: "factoryAudit",
              docId: a.id,
              docNo: a.docNo,
              link: `/factory-audits/findings?auditId=${a.id}`,
              customerId: a.customerId,
              assigneeId,
              dueAt: new Date(Date.parse(`${f.dueDate}T00:00:00Z`) + DAY),
            },
            tx,
          );
          count += 1;
        }
      }
    });
    return { todos: count };
  }

  private async list(ctx: AccessContext, q: z.infer<typeof auditListQuerySchema>, defaultStatuses: AuditStatus[], order: SQL[]): Promise<Page<FactoryAuditDto>> {
    const conds: SQL[] = [scoped(factoryAudits, ctx), inArray(factoryAudits.status, q.status?.length ? q.status : defaultStatuses)];
    if (q.auditType) conds.push(eq(factoryAudits.auditType, q.auditType));
    if (q.factoryId) conds.push(eq(factoryAudits.factoryId, q.factoryId));
    if (q.customerId) conds.push(eq(factoryAudits.customerId, q.customerId));
    if (q.from) conds.push(gte(factoryAudits.plannedDate, q.from));
    if (q.to) conds.push(lte(factoryAudits.plannedDate, q.to));
    const kw = likeKeyword(q.keyword);
    if (kw) conds.push(or(ilike(factoryAudits.docNo, kw), ilike(factoryAudits.auditor, kw))!);
    const where = and(...conds);
    return paginate(
      q,
      async () => (await this.db.select({ n: countAll }).from(factoryAudits).where(where))[0]!.n,
      async (limit, offset) => this.toDtos(await this.db.select().from(factoryAudits).where(where).orderBy(...order).limit(limit).offset(offset)),
    );
  }

  private async resolveCustomer(ctx: AccessContext, tx: DbOrTx, factoryId: string, chosen?: string): Promise<string> {
    const factory = (await tx.select({ id: factories.id }).from(factories).where(and(eq(factories.id, factoryId), isNull(factories.deletedAt))))[0];
    if (!factory) throw notFound("factory");
    const main = await tx
      .select({ customerId: customerOrders.customerId, n: countAll })
      .from(customerOrders)
      .where(eq(customerOrders.factoryId, factoryId))
      .groupBy(customerOrders.customerId)
      .orderBy(desc(countAll), asc(customerOrders.customerId));
    const primary = main.find((m) => canSeeCustomer(ctx, m.customerId));
    if (primary) return primary.customerId;
    if (chosen) {
      const c = (await tx.select({ id: customers.id }).from(customers).where(and(eq(customers.id, chosen), isNull(customers.deletedAt))))[0];
      if (!c || !canSeeCustomer(ctx, c.id)) throw notFound("customer");
      return c.id;
    }
    throw new AppError(factoryauditErrors.FACTORYAUDIT_CUSTOMER_REQUIRED);
  }

  private async lockForAction(ctx: AccessContext, tx: DbOrTx, id: string, version: number): Promise<AuditRow> {
    const before = assertCanSee(ctx, (await tx.select().from(factoryAudits).where(eq(factoryAudits.id, id)))[0]);
    if (before.version !== version) throw versionConflict();
    return before;
  }

  private assertTransition(before: AuditRow, to: AuditStatus, action: string): void {
    if (!canTransition("factoryAudit", before.status as AuditStatus, to)) throw illegalTransition(before.status, action);
  }

  private async applyStatus(ctx: AccessContext, tx: DbOrTx, before: AuditRow, to: AuditStatus, action: string, patch: Partial<AuditRow>): Promise<void> {
    const updated = await tx
      .update(factoryAudits)
      .set({ ...patch, status: to, version: before.version + 1, updatedBy: ctx.userId })
      .where(and(eq(factoryAudits.id, before.id), eq(factoryAudits.version, before.version)))
      .returning();
    if (!updated.length) throw versionConflict();
    await this.audit.log(ctx, { action: `factoryaudit.audit.${action}`, objectType: "factoryAudit", objectId: before.id, docNo: before.docNo, diff: { status: { from: before.status, to }, ...diffOf(before, patch) } }, tx);
  }

  private async openFindingCount(tx: DbOrTx, auditId: string): Promise<number> {
    return (await tx.select({ n: countAll }).from(auditFindings).where(and(eq(auditFindings.auditId, auditId), eq(auditFindings.status, "OPEN"))))[0]!.n;
  }

  private async findingWithAudit(ctx: AccessContext, tx: DbOrTx, id: string): Promise<{ f: FindingRow; a: AuditRow }> {
    const row = (await tx.select({ f: auditFindings, a: factoryAudits }).from(auditFindings).innerJoin(factoryAudits, eq(factoryAudits.id, auditFindings.auditId)).where(eq(auditFindings.id, id)))[0];
    if (!row) throw notFound();
    assertCanSee(ctx, row.a);
    return row;
  }

  private async findingDto(ctx: AccessContext, id: string): Promise<FindingDto> {
    const row = await this.findingWithAudit(ctx, this.db, id);
    return (await this.toFindingDtos([row]))[0]!;
  }

  private async toDtos(rows: AuditRow[]): Promise<FactoryAuditDto[]> {
    if (!rows.length) return [];
    const today = this.clock.today();
    const facRows = await this.db
      .select({ id: factories.id, code: factories.code, name: factories.name, baseName: bases.name })
      .from(factories)
      .innerJoin(bases, eq(bases.id, factories.baseId))
      .where(inArray(factories.id, [...new Set(rows.map((r) => r.factoryId))]));
    const custRows = await this.db.select({ id: customers.id, name: customers.name }).from(customers).where(inArray(customers.id, [...new Set(rows.map((r) => r.customerId))]));
    const ownerRows = await this.db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, [...new Set(rows.map((r) => r.ownerId))]));
    const findings = await this.db.select({ auditId: auditFindings.auditId, status: auditFindings.status, dueDate: auditFindings.dueDate }).from(auditFindings).where(inArray(auditFindings.auditId, rows.map((r) => r.id)));
    return rows.map((r) => {
      const fac = facRows.find((f) => f.id === r.factoryId);
      const own = findings.filter((f) => f.auditId === r.id);
      const open = own.filter((f) => f.status === "OPEN");
      return {
        id: r.id,
        docNo: r.docNo,
        factoryId: r.factoryId,
        factoryCode: fac?.code ?? "",
        factoryName: fac?.name ?? "",
        baseName: fac?.baseName ?? "",
        auditType: r.auditType as AuditType,
        plannedDate: r.plannedDate,
        actualDate: r.actualDate,
        auditor: r.auditor,
        result: (r.result as AuditResult | null) ?? null,
        score: r.score,
        certificateValidUntil: r.certificateValidUntil,
        status: r.status as AuditStatus,
        note: r.note,
        customerId: r.customerId,
        customerName: custRows.find((c) => c.id === r.customerId)?.name ?? "",
        ownerId: r.ownerId,
        ownerName: ownerRows.find((o) => o.id === r.ownerId)?.name ?? "",
        findingCount: own.length,
        openFindingCount: open.length,
        overdueFindingCount: open.filter((f) => f.dueDate && f.dueDate < today).length,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
        version: r.version,
      };
    });
  }

  private async toFindingDtos(rows: { f: FindingRow; a: AuditRow }[]): Promise<FindingDto[]> {
    if (!rows.length) return [];
    const today = this.clock.today();
    const facRows = await this.db.select({ id: factories.id, name: factories.name }).from(factories).where(inArray(factories.id, [...new Set(rows.map((r) => r.a.factoryId))]));
    const custRows = await this.db.select({ id: customers.id, name: customers.name }).from(customers).where(inArray(customers.id, [...new Set(rows.map((r) => r.a.customerId))]));
    return rows.map(({ f, a }) => {
      const overdue = f.status === "OPEN" && !!f.dueDate && f.dueDate < today;
      return {
        id: f.id,
        auditId: a.id,
        auditDocNo: a.docNo,
        auditStatus: a.status as AuditStatus,
        factoryId: a.factoryId,
        factoryName: facRows.find((x) => x.id === a.factoryId)?.name ?? "",
        customerName: custRows.find((x) => x.id === a.customerId)?.name ?? "",
        item: f.item,
        severity: f.severity as FindingDto["severity"],
        correctiveAction: f.correctiveAction,
        responsible: f.responsible,
        dueDate: f.dueDate,
        status: f.status as FindingDto["status"],
        overdue,
        overdueDays: overdue ? Math.floor((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${f.dueDate}T00:00:00Z`)) / DAY) : 0,
        closedAt: iso(f.closedAt),
        closeNote: f.closeNote,
        version: f.version,
      };
    });
  }
}
