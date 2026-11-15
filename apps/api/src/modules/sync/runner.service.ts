import { Inject, Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import { SYNC_AUTO_DISABLE_FAILURES, type SyncCodeMaps, type SyncMappingField, type SyncObject, type SyncProtocol, type SyncRetryResult, type SyncTrigger, isRetryableError, syncErrors, syncRetryDelayMinutes } from "@otd/contracts/sync";
import { type Database, type DbOrTx, customerOrders, styles, syncBatches, syncEndpoints, syncLinks, syncMappings, syncRecords, syncRuns, syncTasks } from "@otd/db";
import { and, asc, desc, eq, gt, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { type AccessContext, systemContext } from "../../core/access/access.types.js";
import { AuditService } from "../../core/audit.service.js";
import { Clock } from "../../core/clock.js";
import { AppError, assertFound, versionConflict } from "../../core/errors.js";
import { type DomainEvent, EventBus, inTransaction } from "../../core/events.js";
import { Scheduler } from "../../core/scheduler.js";
import { DB } from "../../core/tokens.js";
import { NotificationService } from "../notification/notification.service.js";
import { type AdapterDeps, type OutboundRecord, type SyncAdapter, SyncAdapterError, createAdapter } from "./adapters.js";
import { CredentialVault } from "./credential.js";
import { applyMapping, readPath } from "./mapping.js";
import { type SourceRecord, UUID, loadLocal } from "./sources.js";
import { type Counters, hashOf, statusOf, suggestionFor } from "./sync.shared.js";

type TaskRow = typeof syncTasks.$inferSelect;
type EndpointRow = typeof syncEndpoints.$inferSelect;
type RecordRow = typeof syncRecords.$inferSelect;

type Runtime = {
  task: TaskRow;
  endpoint: EndpointRow;
  adapter: SyncAdapter;
  fields: SyncMappingField[];
  codeMaps: SyncCodeMaps;
  keyField: string | null;
};

type Outcome = {
  item: SourceRecord;
  key: string;
  linkId: string;
  attempt: number;
  result: "SUCCESS" | "SKIPPED" | "FAILED";
  errorType: string | null;
  field: string | null;
  message: string | null;
  suggestion: string | null;
  output: Record<string, unknown> | null;
  hash: string | null;
  remoteId: string | null;
};

type Persisted = { status: "SUCCESS" | "SKIPPED" | "FAILED" | "RETRYING"; nextRetryAt: Date | null; abandoned: boolean };

function shift(map: Map<string, Counters>, id: string, field: "success" | "skipped"): void {
  const c = map.get(id) ?? { total: 0, success: 0, failed: 0, skipped: 0 };
  c[field] += 1;
  c.failed -= 1;
  map.set(id, c);
}

const RUNNING_STALE_MS = 30 * 60_000;
const EVENT_OBJECTS: Record<string, SyncObject[]> = { "order.": ["ORDER_DUE", "TNA"], "inspection.": ["INSPECTION"], "testing.": ["TEST_REPORT"] };

@Injectable()
export class SyncRunner implements OnModuleInit {
  private readonly logger = new Logger("SyncRunner");
  private readonly running = new Set<string>();
  private adapterDeps: AdapterDeps = {};

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly audit: AuditService,
    private readonly events: EventBus,
    private readonly clock: Clock,
    private readonly vault: CredentialVault,
    private readonly notifications: NotificationService,
    private readonly scheduler: Scheduler,
  ) {}

  onModuleInit(): void {
    this.scheduler.register({ name: "sync.tick", everyMinutes: 1, run: () => this.tick() });
    for (const prefix of Object.keys(EVENT_OBJECTS)) {
      this.events.on(`${prefix}*`, "sync.eventTrigger", (e) => this.onDomainEvent(e));
    }
  }

  configureAdapters(deps: AdapterDeps): void {
    this.adapterDeps = deps;
  }

  adapterFor(endpoint: EndpointRow): SyncAdapter {
    return createAdapter(
      { name: endpoint.name, protocol: endpoint.protocol as SyncProtocol, baseUrl: endpoint.baseUrl, timeoutMs: endpoint.timeoutMs, options: endpoint.options, credential: this.vault.open(endpoint.credential) },
      this.adapterDeps,
    );
  }

  async tick(): Promise<{ runs: number; retried: number }> {
    const runs = await this.runDueTasks();
    const retried = await this.processDueRetries();
    return { runs, retried };
  }

  async runDueTasks(): Promise<number> {
    const due = await this.db
      .select({ id: syncTasks.id })
      .from(syncTasks)
      .where(and(eq(syncTasks.enabled, true), eq(syncTasks.trigger, "SCHEDULED"), lte(syncTasks.nextRunAt, this.clock.now())))
      .orderBy(asc(syncTasks.nextRunAt));
    let count = 0;
    for (const { id } of due) {
      if (this.running.has(id)) continue;
      try {
        await this.execute(systemContext(), id, "SCHEDULED");
        count += 1;
      } catch (err) {
        this.logger.warn(`scheduled run ${id} skipped: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    return count;
  }

  async processDueRetries(): Promise<number> {
    const due = await this.db
      .select()
      .from(syncRecords)
      .where(and(eq(syncRecords.status, "RETRYING"), lte(syncRecords.nextRetryAt, this.clock.now())))
      .orderBy(asc(syncRecords.nextRetryAt))
      .limit(500);
    const byTask = new Map<string, RecordRow[]>();
    for (const r of due) byTask.set(r.taskId, [...(byTask.get(r.taskId) ?? []), r]);
    let count = 0;
    for (const [taskId, records] of byTask) {
      if (this.running.has(taskId)) continue;
      const task = (await this.db.select().from(syncTasks).where(eq(syncTasks.id, taskId)))[0];
      if (!task?.enabled) continue;
      try {
        const res = await this.guard(taskId, () => this.retryRecords(systemContext(), task, records, "AUTO"));
        count += res.total;
      } catch (err) {
        this.logger.warn(`auto retry for ${task.docNo} skipped: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    return count;
  }

  async onDomainEvent(event: DomainEvent): Promise<void> {
    try {
      const prefix = Object.keys(EVENT_OBJECTS).find((p) => event.type.startsWith(p));
      if (!prefix) return;
      const tasks = await this.db
        .select()
        .from(syncTasks)
        .where(and(eq(syncTasks.enabled, true), eq(syncTasks.trigger, "EVENT"), inArray(syncTasks.object, EVENT_OBJECTS[prefix]!)));
      if (!tasks.length) return;
      const customerId = await this.customerOf(event);
      for (const task of tasks) {
        if (task.customerId && customerId && task.customerId !== customerId) continue;
        if (this.running.has(task.id)) continue;
        try {
          await this.execute(systemContext(), task.id, "EVENT");
        } catch (err) {
          this.logger.warn(`event run ${task.docNo} skipped: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    } catch (err) {
      this.logger.error(`event ${event.type} handling failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private async customerOf(event: DomainEvent): Promise<string | null> {
    const p = event.payload ?? {};
    const text = (v: unknown) => (typeof v === "string" && UUID.test(v) ? v : null);
    const direct = text(p.customerId);
    if (direct) return direct;
    const orderId = text(p.orderId) ?? (event.aggregateType === "order" ? text(event.aggregateId) : null);
    if (orderId) {
      const hit = (await this.db.select({ c: customerOrders.customerId }).from(customerOrders).where(eq(customerOrders.id, orderId)))[0]?.c;
      if (hit) return hit;
    }
    const styleId = text(p.styleId);
    if (styleId) return (await this.db.select({ c: styles.customerId }).from(styles).where(eq(styles.id, styleId)))[0]?.c ?? null;
    return null;
  }

  private async guard<T>(taskId: string, work: () => Promise<T>): Promise<T> {
    if (this.running.has(taskId)) throw new AppError(syncErrors.SYNC_TASK_RUNNING);
    this.running.add(taskId);
    try {
      return await work();
    } finally {
      this.running.delete(taskId);
    }
  }

  private async runtime(task: TaskRow, requireActive: boolean): Promise<Runtime> {
    const endpoint = assertFound((await this.db.select().from(syncEndpoints).where(eq(syncEndpoints.id, task.endpointId)))[0]);
    if (requireActive && endpoint.status !== "ACTIVE") throw new AppError(syncErrors.SYNC_ENDPOINT_DISABLED, { name: endpoint.name });
    const mapping = task.mappingId ? (await this.db.select().from(syncMappings).where(eq(syncMappings.id, task.mappingId)))[0] : undefined;
    const useMapping = mapping && mapping.enabled;
    return {
      task,
      endpoint,
      adapter: this.adapterFor(endpoint),
      fields: useMapping ? (mapping.fields as SyncMappingField[]) : [],
      codeMaps: useMapping ? mapping.codeMaps : {},
      keyField: useMapping ? mapping.keyField : null,
    };
  }

  async execute(ctx: AccessContext, taskId: string, trigger: SyncTrigger, version?: number): Promise<string> {
    return this.guard(taskId, () => this.executeInner(ctx, taskId, trigger, version));
  }

  private async executeInner(ctx: AccessContext, taskId: string, trigger: SyncTrigger, version?: number): Promise<string> {
    const task = assertFound((await this.db.select().from(syncTasks).where(eq(syncTasks.id, taskId)))[0]);
    if (version !== undefined && version !== task.version) throw versionConflict();
    if (!task.enabled) throw new AppError(syncErrors.SYNC_TASK_DISABLED);
    const rt = await this.runtime(task, true);
    const startedAt = this.clock.now();
    const busy = await this.db
      .select({ id: syncRuns.id })
      .from(syncRuns)
      .where(and(eq(syncRuns.taskId, taskId), eq(syncRuns.status, "RUNNING"), gt(syncRuns.startedAt, new Date(startedAt.getTime() - RUNNING_STALE_MS))))
      .limit(1);
    if (busy.length) throw new AppError(syncErrors.SYNC_TASK_RUNNING);

    const run = await inTransaction(this.db, this.events, async (tx) => {
      const created = (
        await tx
          .insert(syncRuns)
          .values({ taskId, trigger, startedAt, status: "RUNNING", steps: [{ key: "START", at: startedAt.toISOString(), ok: true, message: null }], operatorId: ctx.system ? null : ctx.userId })
          .returning()
      )[0]!;
      await this.audit.log(ctx, { action: "sync.task.run", objectType: "syncTask", objectId: taskId, docNo: task.docNo, diff: { trigger, runId: created.id } }, tx);
      return created;
    });

    const t0 = performance.now();
    const totals: Counters = { total: 0, success: 0, failed: 0, skipped: 0 };
    let error: string | null = null;
    let watermark = task.watermark;
    try {
      const incremental = task.mode === "INCREMENTAL";
      let items: SourceRecord[];
      let nextWatermark: string | null;
      if (task.direction === "PUSH") {
        items = await loadLocal(this.db, task.object as SyncObject, { customerId: task.customerId, watermark: incremental ? task.watermark : null });
        nextWatermark = items.reduce<string | null>((acc, r) => (r.updatedAt && (!acc || r.updatedAt > acc) ? r.updatedAt : acc), task.watermark);
      } else {
        const pulled = await rt.adapter.pull(incremental ? task.watermark : null);
        items = pulled.records.map((r) => ({ localId: null, key: r.key, updatedAt: r.updatedAt ?? null, data: r.data }));
        nextWatermark = pulled.watermark;
      }
      const size = Math.max(1, task.batchSize);
      for (let i = 0; i < items.length; i += size) {
        const c = await this.processBatch(rt, run.id, `B${String(i / size + 1).padStart(2, "0")}`, items.slice(i, i + size));
        totals.total += c.total;
        totals.success += c.success;
        totals.failed += c.failed;
        totals.skipped += c.skipped;
      }
      if (incremental) watermark = nextWatermark;
    } catch (err) {
      error = err instanceof SyncAdapterError || err instanceof Error ? err.message : String(err);
    }

    const finishedAt = this.clock.now();
    const status = error ? "FAILED" : statusOf(totals);
    const durationMs = Math.round(performance.now() - t0);
    const resultMessage = error ?? `成功 ${totals.success} 条，失败 ${totals.failed} 条，跳过 ${totals.skipped} 条`;
    let nextRunAt: Date | null = null;
    if (task.trigger === "SCHEDULED" && task.intervalMinutes) {
      const planned = startedAt.getTime() + task.intervalMinutes * 60_000;
      nextRunAt = new Date(planned > finishedAt.getTime() ? planned : finishedAt.getTime() + task.intervalMinutes * 60_000);
    }
    await inTransaction(this.db, this.events, async (tx, emit) => {
      const steps = [
        ...run.steps,
        { key: "RESULT", at: finishedAt.toISOString(), ok: status !== "FAILED", message: resultMessage },
        { key: "LOG", at: finishedAt.toISOString(), ok: true, message: "已写回日志" },
      ];
      await tx.update(syncRuns).set({ status, finishedAt, durationMs, ...totals, steps, error }).where(eq(syncRuns.id, run.id));
      const current = (await tx.select().from(syncTasks).where(eq(syncTasks.id, taskId)))[0]!;
      const streak = status === "FAILED" ? current.consecutiveFailures + 1 : 0;
      await tx
        .update(syncTasks)
        .set({ lastRunAt: startedAt, nextRunAt, lastStatus: status, watermark, consecutiveFailures: streak, updatedAt: current.updatedAt })
        .where(eq(syncTasks.id, taskId));
      await this.audit.log(ctx, { action: "sync.run.finish", objectType: "syncTask", objectId: taskId, docNo: task.docNo, diff: { runId: run.id, status, ...totals, error } }, tx);
      emit({ type: "sync.run.finished", aggregateType: "syncTask", aggregateId: taskId, payload: { docNo: task.docNo, runId: run.id, status, ...totals } });
      if (streak >= SYNC_AUTO_DISABLE_FAILURES && current.enabled) await this.autoDisable(tx, emit, current, streak, finishedAt);
    });
    return run.id;
  }

  private async autoDisable(tx: DbOrTx, emit: (e: DomainEvent) => void, task: TaskRow, streak: number, at: Date): Promise<void> {
    await tx
      .update(syncTasks)
      .set({ enabled: false, disabledReason: "AUTO_FAILURES", nextRunAt: null, version: task.version + 1, updatedAt: at })
      .where(eq(syncTasks.id, task.id));
    await this.audit.log(systemContext(), { action: "sync.task.autoDisable", objectType: "syncTask", objectId: task.id, docNo: task.docNo, diff: { consecutiveFailures: streak, enabled: { from: true, to: false } } }, tx);
    if (task.ownerId) {
      await this.notifications.notify(
        [task.ownerId],
        { type: "SYNC_TASK_AUTO_DISABLED", title: `${task.docNo} 连续 ${streak} 次执行失败，已自动停用`, body: `${task.name}：排查对端或映射后重新启用`, link: `/sync/tasks/${task.id}` },
        tx,
      );
    }
    emit({ type: "sync.task.autoDisabled", aggregateType: "syncTask", aggregateId: task.id, payload: { docNo: task.docNo, consecutiveFailures: streak } });
  }

  private async evaluate(rt: Runtime, entries: { item: SourceRecord; attempt: number }[], skipUnchanged: boolean): Promise<Outcome[]> {
    const { task, endpoint } = rt;
    const linkIds = [...new Set(entries.map((e) => e.item.localId ?? e.item.key))];
    const links = linkIds.length
      ? await this.db
          .select()
          .from(syncLinks)
          .where(and(eq(syncLinks.endpointId, endpoint.id), eq(syncLinks.object, task.object), inArray(syncLinks.localId, linkIds)))
      : [];
    const linkHash = new Map(links.map((l) => [l.localId, l.lastHash]));
    const outcomes: Outcome[] = [];
    const pending: { outcome: Outcome; record: OutboundRecord }[] = [];
    for (const { item, attempt } of entries) {
      const linkId = item.localId ?? item.key;
      const keyValue = rt.keyField ? readPath(item.data, rt.keyField) : undefined;
      const key = keyValue === undefined || keyValue === null || keyValue === "" ? item.key : String(keyValue);
      const outcome: Outcome = { item, key, linkId, attempt, result: "SUCCESS", errorType: null, field: null, message: null, suggestion: null, output: null, hash: null, remoteId: null };
      outcomes.push(outcome);
      const mapped = applyMapping(rt.fields, rt.codeMaps, item.data);
      if (!mapped.ok) {
        const first = mapped.errors[0]!;
        Object.assign(outcome, {
          result: "FAILED",
          errorType: first.type,
          field: first.field,
          message: mapped.errors.length > 1 ? `${first.message}（共 ${mapped.errors.length} 处问题）` : first.message,
          suggestion: first.suggestion,
        });
        continue;
      }
      outcome.output = mapped.output;
      outcome.hash = hashOf(mapped.output);
      if (skipUnchanged && linkHash.get(linkId) === outcome.hash) {
        outcome.result = "SKIPPED";
        continue;
      }
      if (task.direction === "PUSH") pending.push({ outcome, record: { key, localId: item.localId, data: mapped.output, attempt, idempotencyKey: `${task.object}:${linkId}` } });
    }
    if (pending.length) {
      const results = await rt.adapter.push(pending.map((p) => p.record));
      pending.forEach(({ outcome }, i) => {
        const res = results[i];
        if (res?.ok) {
          outcome.remoteId = res.remoteId ?? null;
          return;
        }
        const errorType = res ? res.errorType : "REMOTE_REJECTED";
        Object.assign(outcome, { result: "FAILED", errorType, field: res?.field ?? null, message: res ? res.message : "对端未返回该记录的结果", suggestion: suggestionFor(errorType) });
      });
    }
    return outcomes;
  }

  private persisted(outcome: Outcome, now: Date): Persisted {
    if (outcome.result !== "FAILED") return { status: outcome.result, nextRetryAt: null, abandoned: false };
    if (!isRetryableError(outcome.errorType)) return { status: "FAILED", nextRetryAt: null, abandoned: false };
    const delay = syncRetryDelayMinutes(outcome.attempt);
    if (delay === null) return { status: "FAILED", nextRetryAt: null, abandoned: true };
    return { status: "RETRYING", nextRetryAt: new Date(now.getTime() + delay * 60_000), abandoned: false };
  }

  private async saveLinks(tx: DbOrTx, rt: Runtime, outcomes: Outcome[], now: Date): Promise<void> {
    const ok = outcomes.filter((o) => o.result === "SUCCESS" && o.hash);
    const unique = new Map(ok.map((o) => [o.linkId, o]));
    if (!unique.size) return;
    await tx
      .insert(syncLinks)
      .values([...unique.values()].map((o) => ({ endpointId: rt.endpoint.id, object: rt.task.object, localId: o.linkId, remoteId: o.remoteId ?? o.key, lastHash: o.hash, updatedAt: now })))
      .onConflictDoUpdate({ target: [syncLinks.endpointId, syncLinks.object, syncLinks.localId], set: { remoteId: sql`excluded.remote_id`, lastHash: sql`excluded.last_hash`, updatedAt: sql`excluded.updated_at` } });
  }

  private payloadOf(rt: Runtime, o: Outcome, status: Persisted["status"]): Record<string, unknown> | null {
    if (status === "FAILED" || status === "RETRYING") return o.item.data;
    if (status === "SUCCESS" && rt.task.direction === "PULL") return o.output;
    return null;
  }

  private async processBatch(rt: Runtime, runId: string, batchNo: string, items: SourceRecord[]): Promise<Counters> {
    const startedAt = this.clock.now();
    const t0 = performance.now();
    const outcomes = await this.evaluate(
      rt,
      items.map((item) => ({ item, attempt: 1 })),
      true,
    );
    const now = this.clock.now();
    const rows = outcomes.map((o) => ({ o, p: this.persisted(o, now) }));
    const counters: Counters = {
      total: rows.length,
      success: rows.filter((r) => r.p.status === "SUCCESS").length,
      skipped: rows.filter((r) => r.p.status === "SKIPPED").length,
      failed: rows.filter((r) => r.p.status === "FAILED" || r.p.status === "RETRYING").length,
    };
    await this.db.transaction(async (tx) => {
      await this.supersede(tx, rt.task, outcomes, now);
      const batch = (
        await tx
          .insert(syncBatches)
          .values({ runId, batchNo, object: rt.task.object, startedAt, durationMs: Math.round(performance.now() - t0), ...counters, status: statusOf(counters) })
          .returning({ id: syncBatches.id })
      )[0]!;
      if (rows.length) {
        await tx.insert(syncRecords).values(
          rows.map(({ o, p }) => ({
            taskId: rt.task.id,
            runId,
            batchId: batch.id,
            recordKey: o.key,
            localId: o.item.localId,
            field: o.field,
            errorType: o.errorType,
            errorMessage: o.message,
            suggestion: o.suggestion,
            payload: this.payloadOf(rt, o, p.status),
            status: p.status,
            attempts: 1,
            nextRetryAt: p.nextRetryAt,
            updatedAt: now,
          })),
        );
      }
      await this.saveLinks(tx, rt, outcomes, now);
    });
    return counters;
  }

  private async supersede(tx: DbOrTx, task: TaskRow, outcomes: Outcome[], now: Date): Promise<void> {
    const localIds = [...new Set(outcomes.map((o) => o.item.localId).filter((x): x is string => !!x))];
    const keys = [...new Set(outcomes.filter((o) => !o.item.localId).map((o) => o.key))];
    if (!localIds.length && !keys.length) return;
    const match = [localIds.length ? inArray(syncRecords.localId, localIds) : undefined, keys.length ? and(isNull(syncRecords.localId), inArray(syncRecords.recordKey, keys)) : undefined].filter((x) => x !== undefined);
    const stale = await tx
      .select()
      .from(syncRecords)
      .where(and(eq(syncRecords.taskId, task.id), inArray(syncRecords.status, ["FAILED", "RETRYING"]), or(...match)));
    if (!stale.length) return;
    await tx
      .update(syncRecords)
      .set({ status: "SKIPPED", nextRetryAt: null, errorType: null, errorMessage: "已由新一次执行重新处理", suggestion: null, payload: null, updatedAt: now })
      .where(
        inArray(
          syncRecords.id,
          stale.map((r) => r.id),
        ),
      );
    const batchShift = new Map<string, Counters>();
    const runShift = new Map<string, Counters>();
    for (const r of stale) {
      if (r.batchId) shift(batchShift, r.batchId, "skipped");
      shift(runShift, r.runId, "skipped");
    }
    await this.applyShifts(tx, task, batchShift, runShift);
  }

  async retryFailed(ctx: AccessContext, taskId: string, version: number): Promise<SyncRetryResult> {
    const task = assertFound((await this.db.select().from(syncTasks).where(eq(syncTasks.id, taskId)))[0]);
    if (version !== task.version) throw versionConflict();
    return this.guard(taskId, async () => {
      const records = await this.db
        .select()
        .from(syncRecords)
        .where(and(eq(syncRecords.taskId, taskId), inArray(syncRecords.status, ["FAILED", "RETRYING"])))
        .orderBy(asc(syncRecords.updatedAt));
      return this.retryRecords(ctx, task, records, "MANUAL");
    });
  }

  async retryRecordIds(ctx: AccessContext, tasks: TaskRow[], records: RecordRow[]): Promise<SyncRetryResult> {
    const sum: SyncRetryResult = { total: 0, success: 0, failed: 0, pending: 0, abandoned: 0 };
    for (const task of tasks) {
      const mine = records.filter((r) => r.taskId === task.id && (r.status === "FAILED" || r.status === "RETRYING"));
      if (!mine.length) continue;
      const res = await this.guard(task.id, () => this.retryRecords(ctx, task, mine, "MANUAL"));
      sum.total += res.total;
      sum.success += res.success;
      sum.failed += res.failed;
      sum.pending += res.pending;
      sum.abandoned += res.abandoned;
    }
    return sum;
  }

  private async retryRecords(ctx: AccessContext, task: TaskRow, records: RecordRow[], mode: "AUTO" | "MANUAL"): Promise<SyncRetryResult> {
    const result: SyncRetryResult = { total: records.length, success: 0, failed: 0, pending: 0, abandoned: 0 };
    if (!records.length) return result;
    const rt = await this.runtime(task, true);
    const fresh = new Map<string, SourceRecord>();
    if (task.direction === "PUSH") {
      const ids = records.map((r) => r.localId).filter((id): id is string => !!id && UUID.test(id));
      if (ids.length) for (const s of await loadLocal(this.db, task.object as SyncObject, { ids })) fresh.set(s.localId!, s);
    }
    const missing = new Set<string>();
    const entries = records.map((r) => {
      const current = r.localId ? fresh.get(r.localId) : undefined;
      if (task.direction === "PUSH" && r.localId && UUID.test(r.localId) && !current) missing.add(r.id);
      const item: SourceRecord = current ?? { localId: r.localId, key: r.recordKey, updatedAt: null, data: r.payload ?? {} };
      return { item: { ...item, key: r.recordKey }, attempt: r.attempts + 1 };
    });
    const live = entries.filter((_, i) => !missing.has(records[i]!.id));
    const evaluated = await this.evaluate(rt, live, false);
    const outcomeByRecord = new Map<string, Outcome>();
    let cursor = 0;
    records.forEach((r) => {
      if (!missing.has(r.id)) outcomeByRecord.set(r.id, evaluated[cursor++]!);
    });

    const now = this.clock.now();
    const batchShift = new Map<string, Counters>();
    const runShift = new Map<string, Counters>();
    const abandonedKeys: string[] = [];

    await inTransaction(this.db, this.events, async (tx, emit) => {
      for (const r of records) {
        const o = outcomeByRecord.get(r.id);
        let patch: Partial<RecordRow>;
        if (!o) {
          patch = { status: "SKIPPED", nextRetryAt: null, attempts: r.attempts + 1, errorType: null, field: null, errorMessage: "源记录已不存在或不在任务范围内", suggestion: null, payload: null, updatedAt: now };
        } else {
          const p = this.persisted(o, now);
          patch =
            p.status === "SUCCESS" || p.status === "SKIPPED"
              ? { status: p.status, nextRetryAt: null, attempts: o.attempt, errorType: null, field: null, errorMessage: null, suggestion: null, payload: this.payloadOf(rt, o, p.status), updatedAt: now }
              : { status: p.status, nextRetryAt: p.nextRetryAt, attempts: o.attempt, errorType: o.errorType, field: o.field, errorMessage: o.message, suggestion: o.suggestion, payload: o.item.data, updatedAt: now };
          if (p.abandoned) abandonedKeys.push(r.recordKey);
        }
        await tx.update(syncRecords).set(patch).where(eq(syncRecords.id, r.id));
        if (patch.status === "SUCCESS" || patch.status === "SKIPPED") {
          const field = patch.status === "SUCCESS" ? "success" : "skipped";
          if (patch.status === "SUCCESS") result.success += 1;
          if (r.batchId) shift(batchShift, r.batchId, field);
          shift(runShift, r.runId, field);
        } else if (patch.status === "RETRYING") {
          result.pending += 1;
          result.failed += 1;
        } else {
          result.failed += 1;
        }
      }
      result.abandoned = abandonedKeys.length;
      await this.saveLinks(tx, rt, [...outcomeByRecord.values()], now);
      await this.applyShifts(tx, task, batchShift, runShift);
      if (mode === "MANUAL" || result.success > 0 || abandonedKeys.length > 0) {
        await this.audit.log(ctx, { action: "sync.task.retry", objectType: "syncTask", objectId: task.id, docNo: task.docNo, diff: { mode, ...result } }, tx);
      }
      if (abandonedKeys.length) {
        await this.audit.log(ctx, { action: "sync.record.abandon", objectType: "syncTask", objectId: task.id, docNo: task.docNo, diff: { count: abandonedKeys.length, keys: abandonedKeys.slice(0, 20) } }, tx);
        if (task.ownerId) {
          await this.notifications.notify(
            [task.ownerId],
            { type: "SYNC_RETRY_ABANDONED", title: `${task.docNo} 有 ${abandonedKeys.length} 条记录重试已达上限`, body: `${task.name}：${abandonedKeys.slice(0, 5).join("、")} 需人工处理`, link: `/sync/tasks/${task.id}` },
            tx,
          );
        }
      }
      emit({ type: "sync.records.retried", aggregateType: "syncTask", aggregateId: task.id, payload: { docNo: task.docNo, mode, ...result } });
    });
    return result;
  }

  private async applyShifts(tx: DbOrTx, task: TaskRow, batchShift: Map<string, Counters>, runShift: Map<string, Counters>): Promise<void> {
    for (const [id, c] of batchShift) {
      const b = (await tx.select().from(syncBatches).where(eq(syncBatches.id, id)))[0];
      if (!b) continue;
      const next = { success: b.success + c.success, skipped: b.skipped + c.skipped, failed: Math.max(0, b.failed + c.failed) };
      await tx
        .update(syncBatches)
        .set({ ...next, status: statusOf(next) })
        .where(eq(syncBatches.id, id));
    }
    for (const [id, c] of runShift) {
      const r = (await tx.select().from(syncRuns).where(eq(syncRuns.id, id)))[0];
      if (!r) continue;
      const next = { success: r.success + c.success, skipped: r.skipped + c.skipped, failed: Math.max(0, r.failed + c.failed) };
      const status = r.status === "RUNNING" || r.error ? r.status : statusOf(next);
      await tx
        .update(syncRuns)
        .set({ ...next, status })
        .where(eq(syncRuns.id, id));
    }
    if (runShift.size) {
      const latest = (await tx.select().from(syncRuns).where(eq(syncRuns.taskId, task.id)).orderBy(desc(syncRuns.startedAt)).limit(1))[0];
      if (latest && runShift.has(latest.id) && latest.status !== "RUNNING") {
        await tx.update(syncTasks).set({ lastStatus: latest.status, updatedAt: task.updatedAt }).where(eq(syncTasks.id, task.id));
      }
    }
  }
}
