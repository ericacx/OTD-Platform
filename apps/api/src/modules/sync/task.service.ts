import { Inject, Injectable } from "@nestjs/common";
import type { Page, PageQuery } from "@otd/contracts/common";
import {
  SYNC_ERROR_TYPES,
  SYNC_MAX_RETRIES,
  type SyncBatchDto,
  type SyncLogDto,
  type SyncRecordDto,
  type SyncRetryResult,
  type SyncRunDto,
  type SyncTaskDetailDto,
  type SyncTaskDto,
  type SyncTaskRetryResponse,
  type SyncTrigger,
  syncErrors,
  type syncRetryQueueQuerySchema,
  type syncTaskCreateSchema,
  type syncTaskListQuerySchema,
  type syncTaskUpdateSchema,
} from "@otd/contracts/sync";
import { type Database, type DbOrTx, auditLogs, customers, syncBatches, syncEndpoints, syncMappings, syncRecords, syncRuns, syncTasks, users } from "@otd/db";
import { type SQL, and, asc, desc, eq, gt, ilike, inArray, or, sql } from "drizzle-orm";
import type { z } from "zod";
import type { AccessContext } from "../../core/access/access.types.js";
import { AuditService, diffOf } from "../../core/audit.service.js";
import { Clock } from "../../core/clock.js";
import { AppError, illegalTransition, notFound, versionConflict } from "../../core/errors.js";
import { EventBus, inTransaction } from "../../core/events.js";
import { NumberingService } from "../../core/numbering.service.js";
import { countAll, iso, likeKeyword, paginate } from "../../core/paging.js";
import { DB } from "../../core/tokens.js";
import { SyncEndpointService } from "./endpoint.service.js";
import { SyncRunner } from "./runner.service.js";
import { assertCustomerVisible, customerVisible, frequencyLabel, logSummary, queueStateOf, systemsOf } from "./sync.shared.js";

type TaskRow = typeof syncTasks.$inferSelect;
type RunRow = typeof syncRuns.$inferSelect;
type RecordRow = typeof syncRecords.$inferSelect;
type TaskInput = z.infer<typeof syncTaskCreateSchema> | z.infer<typeof syncTaskUpdateSchema>;

const OPEN_STATUSES = ["FAILED", "RETRYING"];
const RETRYABLE_TYPES = Object.entries(SYNC_ERROR_TYPES)
  .filter(([, v]) => v.retryable)
  .map(([k]) => k);

@Injectable()
export class SyncTaskService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly audit: AuditService,
    private readonly events: EventBus,
    private readonly clock: Clock,
    private readonly numbering: NumberingService,
    private readonly endpoints: SyncEndpointService,
    private readonly runner: SyncRunner,
  ) {}

  async list(ctx: AccessContext, q: z.infer<typeof syncTaskListQuerySchema>): Promise<Page<SyncTaskDto>> {
    const conds: SQL[] = [customerVisible(syncTasks.customerId, ctx)];
    if (q.object) conds.push(eq(syncTasks.object, q.object));
    if (q.direction) conds.push(eq(syncTasks.direction, q.direction));
    if (q.trigger) conds.push(eq(syncTasks.trigger, q.trigger));
    if (q.lastStatus?.length) conds.push(inArray(syncTasks.lastStatus, q.lastStatus));
    if (q.enabled !== undefined) conds.push(eq(syncTasks.enabled, q.enabled));
    if (q.customerId) conds.push(eq(syncTasks.customerId, q.customerId));
    if (q.endpointId) conds.push(eq(syncTasks.endpointId, q.endpointId));
    const kw = likeKeyword(q.keyword);
    if (kw) conds.push(or(ilike(syncTasks.docNo, kw), ilike(syncTasks.name, kw))!);
    const where = and(...conds);
    return paginate(
      q,
      async () => (await this.db.select({ n: countAll }).from(syncTasks).where(where))[0]!.n,
      async (limit, offset) => this.toDtos(await this.db.select().from(syncTasks).where(where).orderBy(desc(syncTasks.docNo)).limit(limit).offset(offset)),
    );
  }

  async find(ctx: AccessContext, id: string, db: DbOrTx = this.db): Promise<TaskRow> {
    return assertCustomerVisible(ctx, (await db.select().from(syncTasks).where(eq(syncTasks.id, id)))[0]);
  }

  async get(ctx: AccessContext, id: string): Promise<SyncTaskDetailDto> {
    const task = await this.find(ctx, id);
    const [dto] = await this.toDtos([task]);
    const latest = (await this.db.select().from(syncRuns).where(eq(syncRuns.taskId, id)).orderBy(desc(syncRuns.startedAt)).limit(1))[0];
    const failures = await this.db
      .select()
      .from(syncRecords)
      .where(and(eq(syncRecords.taskId, id), inArray(syncRecords.status, OPEN_STATUSES)))
      .orderBy(asc(syncRecords.recordKey))
      .limit(200);
    return { ...dto!, latestRun: latest ? (await this.toRuns([latest], true))[0]! : null, failures: await this.toRecords(failures) };
  }

  private async validate(ctx: AccessContext, input: TaskInput, tx: DbOrTx): Promise<void> {
    const endpoint = await this.endpoints.find(ctx, input.endpointId, tx);
    if (input.customerId && endpoint.customerId && input.customerId !== endpoint.customerId) throw new AppError(syncErrors.SYNC_MAPPING_MISMATCH);
    if (input.mappingId) {
      const m = (await tx.select().from(syncMappings).where(eq(syncMappings.id, input.mappingId)))[0];
      if (!m) throw notFound();
      if (m.endpointId !== input.endpointId || m.object !== input.object || m.direction !== input.direction) throw new AppError(syncErrors.SYNC_MAPPING_MISMATCH);
    }
    if (input.trigger === "SCHEDULED" && !input.intervalMinutes) throw new AppError(syncErrors.SYNC_INTERVAL_REQUIRED);
  }

  private nextRunAt(trigger: SyncTrigger, enabled: boolean, interval: number | null | undefined): Date | null {
    if (trigger !== "SCHEDULED" || !enabled || !interval) return null;
    return new Date(this.clock.now().getTime() + interval * 60_000);
  }

  private values(input: TaskInput, endpointCustomerId: string | null) {
    const interval = input.trigger === "SCHEDULED" ? (input.intervalMinutes ?? null) : null;
    return {
      name: input.name,
      endpointId: input.endpointId,
      mappingId: input.mappingId ?? null,
      customerId: input.customerId ?? endpointCustomerId,
      object: input.object,
      direction: input.direction,
      mode: input.mode,
      trigger: input.trigger,
      intervalMinutes: interval,
      frequency: input.frequency ?? frequencyLabel(interval),
      batchSize: input.batchSize,
      note: input.note ?? null,
    };
  }

  async create(ctx: AccessContext, input: z.infer<typeof syncTaskCreateSchema>): Promise<SyncTaskDetailDto> {
    const row = await inTransaction(this.db, this.events, async (tx, emit) => {
      await this.validate(ctx, input, tx);
      const endpoint = await this.endpoints.find(ctx, input.endpointId, tx);
      const docNo = await this.numbering.next("syncTask", tx);
      const now = this.clock.now();
      const values = this.values(input, endpoint.customerId);
      const created = (
        await tx
          .insert(syncTasks)
          .values({ docNo, ...values, ownerId: input.ownerId ?? ctx.userId, enabled: input.enabled, nextRunAt: this.nextRunAt(input.trigger, input.enabled, values.intervalMinutes), createdBy: ctx.userId, createdAt: now, updatedAt: now })
          .returning()
      )[0]!;
      await this.audit.log(ctx, { action: "sync.task.create", objectType: "syncTask", objectId: created.id, docNo, diff: { name: input.name, object: input.object, direction: input.direction } }, tx);
      emit({ type: "sync.task.created", aggregateType: "syncTask", aggregateId: created.id, payload: { docNo } });
      return created;
    });
    return this.get(ctx, row.id);
  }

  async update(ctx: AccessContext, id: string, input: z.infer<typeof syncTaskUpdateSchema>): Promise<SyncTaskDetailDto> {
    await inTransaction(this.db, this.events, async (tx) => {
      const before = await this.find(ctx, id, tx);
      if (before.version !== input.version) throw versionConflict();
      await this.validate(ctx, input, tx);
      const endpoint = await this.endpoints.find(ctx, input.endpointId, tx);
      const patch = { ...this.values(input, endpoint.customerId), ownerId: input.ownerId ?? before.ownerId };
      const scheduleChanged = patch.trigger !== before.trigger || patch.intervalMinutes !== before.intervalMinutes;
      const nextRunAt = scheduleChanged ? this.nextRunAt(patch.trigger, before.enabled, patch.intervalMinutes) : before.nextRunAt;
      const watermark = patch.mode !== before.mode || patch.mappingId !== before.mappingId || patch.endpointId !== before.endpointId ? null : before.watermark;
      const updated = (
        await tx
          .update(syncTasks)
          .set({ ...patch, nextRunAt, watermark, version: before.version + 1, updatedBy: ctx.userId, updatedAt: this.clock.now() })
          .where(and(eq(syncTasks.id, id), eq(syncTasks.version, input.version)))
          .returning({ id: syncTasks.id })
      )[0];
      if (!updated) throw versionConflict();
      await this.audit.log(ctx, { action: "sync.task.update", objectType: "syncTask", objectId: id, docNo: before.docNo, diff: diffOf(before as Record<string, unknown>, patch) }, tx);
    });
    return this.get(ctx, id);
  }

  async setEnabled(ctx: AccessContext, id: string, enabled: boolean, version: number): Promise<SyncTaskDetailDto> {
    const action = enabled ? "enable" : "disable";
    await inTransaction(this.db, this.events, async (tx, emit) => {
      const before = await this.find(ctx, id, tx);
      if (before.version !== version) throw versionConflict();
      if (before.enabled === enabled) throw illegalTransition(before.enabled ? "ENABLED" : "DISABLED", action);
      const updated = (
        await tx
          .update(syncTasks)
          .set({
            enabled,
            disabledReason: enabled ? null : "MANUAL",
            ...(enabled ? { consecutiveFailures: 0 } : {}),
            nextRunAt: this.nextRunAt(before.trigger as SyncTrigger, enabled, before.intervalMinutes),
            version: before.version + 1,
            updatedBy: ctx.userId,
            updatedAt: this.clock.now(),
          })
          .where(and(eq(syncTasks.id, id), eq(syncTasks.version, version)))
          .returning({ id: syncTasks.id })
      )[0];
      if (!updated) throw versionConflict();
      await this.audit.log(ctx, { action: `sync.task.${action}`, objectType: "syncTask", objectId: id, docNo: before.docNo, diff: { enabled: { from: before.enabled, to: enabled } } }, tx);
      emit({ type: `sync.task.${action}d`, aggregateType: "syncTask", aggregateId: id, payload: { docNo: before.docNo } });
    });
    return this.get(ctx, id);
  }

  async run(ctx: AccessContext, id: string, version: number): Promise<SyncTaskDetailDto> {
    await this.find(ctx, id);
    await this.runner.execute(ctx, id, "MANUAL", version);
    return this.get(ctx, id);
  }

  async retryFailed(ctx: AccessContext, id: string, version: number): Promise<SyncTaskRetryResponse> {
    const task = await this.find(ctx, id);
    if (!task.enabled) throw new AppError(syncErrors.SYNC_TASK_DISABLED);
    const result = await this.runner.retryFailed(ctx, id, version);
    return { result, task: await this.get(ctx, id) };
  }

  async retryRecords(ctx: AccessContext, recordIds: string[]): Promise<SyncRetryResult> {
    const records = await this.db.select().from(syncRecords).where(inArray(syncRecords.id, recordIds));
    const taskIds = [...new Set(records.map((r) => r.taskId))];
    const tasks = taskIds.length ? await this.db.select().from(syncTasks).where(inArray(syncTasks.id, taskIds)) : [];
    for (const t of tasks) assertCustomerVisible(ctx, t);
    if (records.length !== recordIds.length) throw notFound();
    return this.runner.retryRecordIds(ctx, tasks, records);
  }

  async runs(ctx: AccessContext, id: string, q: PageQuery): Promise<Page<SyncRunDto>> {
    await this.find(ctx, id);
    const where = eq(syncRuns.taskId, id);
    return paginate(
      q,
      async () => (await this.db.select({ n: countAll }).from(syncRuns).where(where))[0]!.n,
      async (limit, offset) => this.toRuns(await this.db.select().from(syncRuns).where(where).orderBy(desc(syncRuns.startedAt)).limit(limit).offset(offset), false),
    );
  }

  async runDetail(ctx: AccessContext, runId: string): Promise<SyncRunDto> {
    const run = (await this.db.select().from(syncRuns).where(eq(syncRuns.id, runId)))[0];
    if (!run) throw notFound();
    await this.find(ctx, run.taskId);
    return (await this.toRuns([run], true))[0]!;
  }

  async logs(ctx: AccessContext, id: string, q: PageQuery): Promise<Page<SyncLogDto>> {
    await this.find(ctx, id);
    const where = and(eq(auditLogs.objectType, "syncTask"), eq(auditLogs.objectId, id));
    return paginate(
      q,
      async () => (await this.db.select({ n: countAll }).from(auditLogs).where(where))[0]!.n,
      async (limit, offset) =>
        (await this.db.select().from(auditLogs).where(where).orderBy(desc(auditLogs.at), desc(auditLogs.id)).limit(limit).offset(offset)).map((r) => {
          const params = (r.diff ?? {}) as Record<string, unknown>;
          return { id: r.id, at: r.at.toISOString(), userName: r.userName, action: r.action, params, summary: logSummary(r.action, params) };
        }),
    );
  }

  async retryQueue(ctx: AccessContext, q: z.infer<typeof syncRetryQueueQuerySchema>): Promise<Page<SyncRecordDto>> {
    const conds: SQL[] = [inArray(syncRecords.status, OPEN_STATUSES), customerVisible(syncTasks.customerId, ctx)];
    if (q.taskId) conds.push(eq(syncRecords.taskId, q.taskId));
    if (q.errorType?.length) conds.push(inArray(syncRecords.errorType, q.errorType));
    if (q.state?.length) {
      const exhausted = and(eq(syncRecords.status, "FAILED"), inArray(syncRecords.errorType, RETRYABLE_TYPES), gt(syncRecords.attempts, SYNC_MAX_RETRIES))!;
      const parts: SQL[] = [];
      if (q.state.includes("PENDING")) parts.push(eq(syncRecords.status, "RETRYING"));
      if (q.state.includes("ABANDONED")) parts.push(exhausted);
      if (q.state.includes("MANUAL")) parts.push(and(eq(syncRecords.status, "FAILED"), sql`not (${exhausted})`)!);
      conds.push(parts.length ? or(...parts)! : sql`false`);
    }
    const kw = likeKeyword(q.keyword);
    if (kw) conds.push(or(ilike(syncRecords.recordKey, kw), ilike(syncTasks.docNo, kw), ilike(syncTasks.name, kw))!);
    const where = and(...conds);
    return paginate(
      q,
      async () => (await this.db.select({ n: countAll }).from(syncRecords).innerJoin(syncTasks, eq(syncTasks.id, syncRecords.taskId)).where(where))[0]!.n,
      async (limit, offset) =>
        this.toRecords(
          (
            await this.db
              .select({ r: syncRecords })
              .from(syncRecords)
              .innerJoin(syncTasks, eq(syncTasks.id, syncRecords.taskId))
              .where(where)
              .orderBy(sql`${syncRecords.nextRetryAt} asc nulls last`, desc(syncRecords.updatedAt))
              .limit(limit)
              .offset(offset)
          ).map((x) => x.r),
        ),
    );
  }

  private async toDtos(rows: TaskRow[]): Promise<SyncTaskDto[]> {
    if (!rows.length) return [];
    const eps = await this.db
      .select()
      .from(syncEndpoints)
      .where(inArray(syncEndpoints.id, [...new Set(rows.map((r) => r.endpointId))]));
    const mappingIds = [...new Set(rows.map((r) => r.mappingId).filter((x): x is string => !!x))];
    const maps = mappingIds.length ? await this.db.select({ id: syncMappings.id, name: syncMappings.name }).from(syncMappings).where(inArray(syncMappings.id, mappingIds)) : [];
    const customerIds = [...new Set(rows.map((r) => r.customerId).filter((x): x is string => !!x))];
    const custs = customerIds.length ? await this.db.select({ id: customers.id, name: customers.name, code: customers.code }).from(customers).where(inArray(customers.id, customerIds)) : [];
    const ownerIds = [...new Set(rows.map((r) => r.ownerId).filter((x): x is string => !!x))];
    const owners = ownerIds.length ? await this.db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, ownerIds)) : [];
    const open = await this.db
      .select({ taskId: syncRecords.taskId, n: countAll })
      .from(syncRecords)
      .where(
        and(
          inArray(
            syncRecords.taskId,
            rows.map((r) => r.id),
          ),
          inArray(syncRecords.status, OPEN_STATUSES),
        ),
      )
      .groupBy(syncRecords.taskId);
    return rows.map((r) => {
      const ep = eps.find((e) => e.id === r.endpointId);
      const cust = custs.find((c) => c.id === r.customerId);
      return {
        id: r.id,
        docNo: r.docNo,
        name: r.name,
        endpointId: r.endpointId,
        endpointName: ep?.name ?? "",
        endpointKind: (ep?.kind ?? "CUSTOMER") as SyncTaskDto["endpointKind"],
        protocol: (ep?.protocol ?? "MOCK") as SyncTaskDto["protocol"],
        mappingId: r.mappingId,
        mappingName: maps.find((m) => m.id === r.mappingId)?.name ?? null,
        customerId: r.customerId,
        customerName: cust?.name ?? null,
        customerCode: cust?.code ?? null,
        object: r.object as SyncTaskDto["object"],
        direction: r.direction as SyncTaskDto["direction"],
        mode: r.mode as SyncTaskDto["mode"],
        trigger: r.trigger as SyncTaskDto["trigger"],
        intervalMinutes: r.intervalMinutes,
        frequency: r.frequency,
        batchSize: r.batchSize,
        ...systemsOf(r.direction, ep?.name ?? ""),
        ownerId: r.ownerId,
        ownerName: owners.find((o) => o.id === r.ownerId)?.name ?? null,
        lastRunAt: iso(r.lastRunAt),
        nextRunAt: iso(r.nextRunAt),
        lastStatus: (r.lastStatus ?? null) as SyncTaskDto["lastStatus"],
        watermark: r.watermark,
        enabled: r.enabled,
        disabledReason: r.enabled ? null : ((r.disabledReason ?? "MANUAL") as SyncTaskDto["disabledReason"]),
        consecutiveFailures: r.consecutiveFailures,
        note: r.note,
        openFailures: open.find((o) => o.taskId === r.id)?.n ?? 0,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
        version: r.version,
      };
    });
  }

  private async toRuns(rows: RunRow[], withBatches: boolean): Promise<SyncRunDto[]> {
    if (!rows.length) return [];
    const batches = withBatches
      ? await this.db
          .select()
          .from(syncBatches)
          .where(
            inArray(
              syncBatches.runId,
              rows.map((r) => r.id),
            ),
          )
          .orderBy(asc(syncBatches.batchNo))
      : [];
    const operatorIds = [...new Set(rows.map((r) => r.operatorId).filter((x): x is string => !!x))];
    const ops = operatorIds.length ? await this.db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, operatorIds)) : [];
    return rows.map((r) => ({
      id: r.id,
      taskId: r.taskId,
      trigger: r.trigger as SyncRunDto["trigger"],
      status: r.status as SyncRunDto["status"],
      startedAt: r.startedAt.toISOString(),
      finishedAt: iso(r.finishedAt),
      durationMs: r.durationMs,
      total: r.total,
      success: r.success,
      failed: r.failed,
      skipped: r.skipped,
      steps: r.steps.map((s) => ({ key: s.key as SyncRunDto["steps"][number]["key"], at: s.at, ok: s.ok, message: s.message ?? null })),
      error: r.error,
      operatorName: ops.find((o) => o.id === r.operatorId)?.name ?? null,
      batches: batches
        .filter((b) => b.runId === r.id)
        .map(
          (b): SyncBatchDto => ({
            id: b.id,
            batchNo: b.batchNo,
            object: b.object as SyncBatchDto["object"],
            startedAt: b.startedAt.toISOString(),
            durationMs: b.durationMs,
            total: b.total,
            success: b.success,
            failed: b.failed,
            skipped: b.skipped,
            status: b.status as SyncBatchDto["status"],
          }),
        ),
    }));
  }

  private async toRecords(rows: RecordRow[]): Promise<SyncRecordDto[]> {
    if (!rows.length) return [];
    const tasks = await this.db
      .select({ id: syncTasks.id, docNo: syncTasks.docNo, name: syncTasks.name })
      .from(syncTasks)
      .where(inArray(syncTasks.id, [...new Set(rows.map((r) => r.taskId))]));
    const batchIds = [...new Set(rows.map((r) => r.batchId).filter((x): x is string => !!x))];
    const batches = batchIds.length ? await this.db.select({ id: syncBatches.id, batchNo: syncBatches.batchNo }).from(syncBatches).where(inArray(syncBatches.id, batchIds)) : [];
    return rows.map((r) => {
      const t = tasks.find((x) => x.id === r.taskId);
      return {
        id: r.id,
        taskId: r.taskId,
        taskDocNo: t?.docNo ?? "",
        taskName: t?.name ?? "",
        runId: r.runId,
        batchNo: batches.find((b) => b.id === r.batchId)?.batchNo ?? null,
        recordKey: r.recordKey,
        field: r.field,
        errorType: (r.errorType ?? null) as SyncRecordDto["errorType"],
        errorMessage: r.errorMessage,
        suggestion: r.suggestion,
        status: r.status as SyncRecordDto["status"],
        queueState: queueStateOf(r.status, r.errorType, r.attempts),
        attempts: r.attempts,
        nextRetryAt: iso(r.nextRetryAt),
        updatedAt: r.updatedAt.toISOString(),
      };
    });
  }
}

