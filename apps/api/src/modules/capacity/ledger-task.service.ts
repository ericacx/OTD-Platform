import { Inject, Injectable, type OnModuleInit } from "@nestjs/common";
import { type LedgerTaskDto, type ledgerTaskCompleteSchema, type ledgerTaskUpdateSchema, capacityErrors } from "@otd/contracts/capacity";
import { type Database, type DbOrTx, ledgerTasks, orgs, users } from "@otd/db";
import { canTransition } from "@otd/shared";
import { and, asc, eq, inArray, isNotNull, isNull, lt, lte } from "drizzle-orm";
import type { z } from "zod";
import { type AccessContext, hasPermission, systemContext } from "../../core/access/access.types.js";
import { AuditService } from "../../core/audit.service.js";
import { Clock } from "../../core/clock.js";
import { AppError, assertFound, illegalTransition, versionConflict } from "../../core/errors.js";
import { EventBus, inTransaction } from "../../core/events.js";
import { iso } from "../../core/paging.js";
import { Scheduler } from "../../core/scheduler.js";
import { DB } from "../../core/tokens.js";
import { NotificationService } from "../notification/notification.service.js";
import { TodoService } from "../todo/todo.service.js";

type TaskRow = typeof ledgerTasks.$inferSelect;
type TaskStatus = "PENDING" | "UPDATING" | "DONE" | "OVERDUE";

const DAY = 86_400_000;
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);
const taskTodoPrefix = (id: string) => `capacity.task:${id}:`;

export function nextDue(from: string, frequency: string): string {
  const d = new Date(`${from}T00:00:00Z`);
  if (frequency === "WEEKLY") return new Date(d.getTime() + 7 * DAY).toISOString().slice(0, 10);
  const day = d.getUTCDate();
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, last));
  return target.toISOString().slice(0, 10);
}

@Injectable()
export class LedgerTaskService implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly audit: AuditService,
    private readonly events: EventBus,
    private readonly clock: Clock,
    private readonly scheduler: Scheduler,
    private readonly todos: TodoService,
    private readonly notifications: NotificationService,
  ) {}

  onModuleInit(): void {
    this.scheduler.register({ name: "capacity.ledger-overdue", dailyAt: "00:20", run: () => this.markOverdue() });
  }

  async list(): Promise<LedgerTaskDto[]> {
    return this.toDtos(await this.db.select().from(ledgerTasks).orderBy(asc(ledgerTasks.createdAt), asc(ledgerTasks.ledger)));
  }

  async start(ctx: AccessContext, id: string, version: number): Promise<LedgerTaskDto> {
    await inTransaction(this.db, this.events, async (tx) => {
      const before = await this.lock(ctx, tx, id, version);
      if (!canTransition("ledgerTask", before.status as TaskStatus, "UPDATING")) throw illegalTransition(before.status, "start");
      await this.write(tx, before, { status: "UPDATING" }, ctx.userId);
      await this.audit.log(ctx, { action: "capacity.task.start", objectType: "ledgerTask", objectId: id, docNo: before.name, diff: { status: { from: before.status, to: "UPDATING" } } }, tx);
    });
    return this.get(id);
  }

  async complete(ctx: AccessContext, id: string, input: z.infer<typeof ledgerTaskCompleteSchema>): Promise<LedgerTaskDto> {
    await inTransaction(this.db, this.events, async (tx, emit) => {
      const before = await this.lock(ctx, tx, id, input.version);
      const from = before.status as TaskStatus;
      const ok = from === "UPDATING" ? canTransition("ledgerTask", from, "DONE") : canTransition("ledgerTask", from, "UPDATING") && canTransition("ledgerTask", "UPDATING", "DONE");
      if (!ok) throw illegalTransition(before.status, "complete");
      const today = this.clock.today();
      const patch: Partial<TaskRow> = {
        status: "DONE",
        lastUpdatedAt: this.clock.now(),
        nextDueAt: nextDue(today, before.frequency),
        note: input.note ?? null,
        escalatedAt: null,
        ...(input.currentVersion ? { currentVersion: input.currentVersion } : {}),
      };
      await this.write(tx, before, patch, ctx.userId);
      await this.todos.closeByPrefix(taskTodoPrefix(id), tx);
      await this.audit.log(ctx, { action: "capacity.task.complete", objectType: "ledgerTask", objectId: id, docNo: before.name, diff: { status: { from: before.status, to: "DONE" }, nextDueAt: { from: before.nextDueAt, to: patch.nextDueAt } } }, tx);
      emit({ type: "capacity.task.completed", aggregateType: "ledgerTask", aggregateId: id, payload: { ledger: before.ledger } });
    });
    return this.get(id);
  }

  async update(ctx: AccessContext, id: string, input: z.infer<typeof ledgerTaskUpdateSchema>): Promise<LedgerTaskDto> {
    await inTransaction(this.db, this.events, async (tx) => {
      const before = assertFound((await tx.select().from(ledgerTasks).where(eq(ledgerTasks.id, id)))[0]);
      if (before.version !== input.version) throw versionConflict();
      const { version: _v, ...rest } = input;
      const patch = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined)) as Partial<TaskRow>;
      if (patch.ownerId) assertFound((await tx.select({ id: users.id }).from(users).where(eq(users.id, patch.ownerId)))[0]);
      await this.write(tx, before, patch, ctx.userId);
      await this.audit.log(ctx, { action: "capacity.task.update", objectType: "ledgerTask", objectId: id, docNo: before.name, diff: rest }, tx);
    });
    return this.get(id);
  }

  async markOverdue(): Promise<number> {
    const today = this.clock.today();
    const now = this.clock.now();
    const sys = systemContext();
    const escalateTo = await this.escalationTarget();
    return inTransaction(this.db, this.events, async (tx) => {
      const due = await tx.select().from(ledgerTasks).where(and(eq(ledgerTasks.status, "DONE"), isNotNull(ledgerTasks.nextDueAt), lte(ledgerTasks.nextDueAt, today)));
      for (const t of due) {
        if (!canTransition("ledgerTask", "DONE", "PENDING")) continue;
        await tx.update(ledgerTasks).set({ status: "PENDING", version: t.version + 1 }).where(eq(ledgerTasks.id, t.id));
      }
      const late = await tx.select().from(ledgerTasks).where(and(inArray(ledgerTasks.status, ["PENDING", "UPDATING", "OVERDUE"]), isNotNull(ledgerTasks.nextDueAt), lt(ledgerTasks.nextDueAt, today)));
      let fresh = 0;
      for (const t of late) {
        const days = daysBetween(t.nextDueAt!, today);
        const note = `应更新日 ${t.nextDueAt}，逾期 ${days} 天，已升级告警至集团计划部负责人`;
        const newlyOverdue = t.status !== "OVERDUE";
        if (newlyOverdue && !canTransition("ledgerTask", t.status as TaskStatus, "OVERDUE")) continue;
        await tx
          .update(ledgerTasks)
          .set({ status: "OVERDUE", note, ...(newlyOverdue ? { escalatedAt: now } : {}), version: t.version + 1 })
          .where(eq(ledgerTasks.id, t.id));
        if (!newlyOverdue) continue;
        fresh += 1;
        if (t.ownerId) {
          await this.todos.upsert(
            {
              fingerprint: `${taskTodoPrefix(t.id)}${t.nextDueAt}`,
              source: "FLOW",
              action: "capacity.task.update",
              title: `更新台账：${t.name}`,
              description: note,
              docType: "ledgerTask",
              docId: t.id,
              docNo: t.currentVersion,
              link: "/capacity/tasks",
              assigneeId: t.ownerId,
              dueAt: new Date(`${t.nextDueAt}T00:00:00Z`),
            },
            tx,
          );
        }
        const recipients = [t.ownerId, escalateTo].filter((x): x is string => !!x);
        await this.notifications.notify(recipients, { type: "capacity.task.overdue", title: `台账更新逾期：${t.name}`, body: note, link: "/capacity/tasks" }, tx);
        await this.audit.log(sys, { action: "capacity.task.overdue", objectType: "ledgerTask", objectId: t.id, docNo: t.name, diff: { status: { from: t.status, to: "OVERDUE" }, escalatedTo: escalateTo } }, tx);
      }
      return fresh;
    });
  }

  private async escalationTarget(): Promise<string | null> {
    const planning = (await this.db.select({ leaderId: orgs.leaderId }).from(orgs).where(and(eq(orgs.function, "PLANNING"), isNotNull(orgs.leaderId))).orderBy(asc(orgs.path)).limit(1))[0];
    if (planning?.leaderId) return planning.leaderId;
    const root = (await this.db.select({ leaderId: orgs.leaderId }).from(orgs).where(isNull(orgs.parentId)).limit(1))[0];
    return root?.leaderId ?? null;
  }

  private async get(id: string): Promise<LedgerTaskDto> {
    return (await this.toDtos([assertFound((await this.db.select().from(ledgerTasks).where(eq(ledgerTasks.id, id)))[0])]))[0]!;
  }

  private async lock(ctx: AccessContext, tx: DbOrTx, id: string, version: number): Promise<TaskRow> {
    const before = assertFound((await tx.select().from(ledgerTasks).where(eq(ledgerTasks.id, id)))[0]);
    if (!hasPermission(ctx, "capacity.task.edit") && before.ownerId !== ctx.userId) throw new AppError(capacityErrors.CAPACITY_TASK_NOT_OWNER);
    if (before.version !== version) throw versionConflict();
    return before;
  }

  private async write(tx: DbOrTx, before: TaskRow, patch: Partial<TaskRow>, userId: string): Promise<void> {
    const updated = (await tx.update(ledgerTasks).set({ ...patch, version: before.version + 1, updatedBy: userId }).where(and(eq(ledgerTasks.id, before.id), eq(ledgerTasks.version, before.version))).returning())[0];
    if (!updated) throw versionConflict();
  }

  private async toDtos(rows: TaskRow[]): Promise<LedgerTaskDto[]> {
    const ids = [...new Set(rows.map((r) => r.ownerId).filter((x): x is string => !!x))];
    const people = ids.length ? await this.db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, ids)) : [];
    const today = this.clock.today();
    return rows.map((r) => ({
      id: r.id,
      ledger: r.ledger,
      name: r.name,
      frequency: r.frequency as LedgerTaskDto["frequency"],
      ownerId: r.ownerId,
      ownerName: people.find((p) => p.id === r.ownerId)?.name ?? null,
      currentVersion: r.currentVersion,
      lastUpdatedAt: iso(r.lastUpdatedAt),
      nextDueAt: r.nextDueAt,
      status: r.status as LedgerTaskDto["status"],
      overdueDays: r.nextDueAt && r.status !== "DONE" && r.nextDueAt < today ? daysBetween(r.nextDueAt, today) : 0,
      note: r.note,
      escalatedAt: iso(r.escalatedAt),
      version: r.version,
    }));
  }
}
