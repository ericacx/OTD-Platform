import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnModuleInit } from "@nestjs/common";
import type { PatrolSeverity, PatrolTrigger } from "@otd/contracts/patrol";
import { type Database, type DbOrTx, orgs, patrolHits, patrolRules, patrolRuns, rolePermissions, roles, systemParams, todos, userRoles, users } from "@otd/db";
import { and, desc, eq, gte, inArray, ne } from "drizzle-orm";
import { performance } from "node:perf_hooks";
import type { AccessContext } from "../../core/access/access.types.js";
import { AuditService } from "../../core/audit.service.js";
import { Clock } from "../../core/clock.js";
import { EventBus, inTransaction } from "../../core/events.js";
import { NumberingService } from "../../core/numbering.service.js";
import { Scheduler } from "../../core/scheduler.js";
import { DB } from "../../core/tokens.js";
import { FlowConfigService } from "../flow/flow-config.service.js";
import { NotificationService } from "../notification/notification.service.js";
import { TodoService } from "../todo/todo.service.js";
import { DEFAULT_PATROL_SCHEDULE, dueAutoRun, normalizeSchedule } from "./patrol.schedule.js";
import { PATROL_RULE_TYPES } from "./rules/index.js";
import { DAY_MS, type PatrolCandidate, type PatrolJudgement, type RuleParams, type RuleScope } from "./rules/types.js";

type RunRow = typeof patrolRuns.$inferSelect;
type RuleRow = typeof patrolRules.$inferSelect;
type HitRow = typeof patrolHits.$inferSelect;
type Member = { id: string; orgId: string };
type Found = { rule: RuleRow; candidate: PatrolCandidate; judgement: PatrolJudgement; fingerprint: string };

export const SILENCE_DAYS = 3;
export const ESCALATE_AFTER_DAYS = 3;
export const patrolTodoKey = (fingerprint: string) => `patrol:${fingerprint}`;

@Injectable()
export class PatrolRunner implements OnModuleInit, OnApplicationBootstrap {
  private readonly logger = new Logger("Patrol");
  private current: { started: Promise<RunRow>; done: Promise<RunRow> } | null = null;

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly clock: Clock,
    private readonly numbering: NumberingService,
    private readonly events: EventBus,
    private readonly audit: AuditService,
    private readonly scheduler: Scheduler,
    private readonly todos: TodoService,
    private readonly notifications: NotificationService,
    private readonly flow: FlowConfigService,
  ) {}

  onModuleInit(): void {
    this.scheduler.register({ name: "patrol.daily", everyMinutes: 5, run: () => this.autoTick("FULL") });
    this.scheduler.register({ name: "patrol.interval", everyMinutes: 5, run: () => this.autoTick("INTERVAL") });
  }

  onApplicationBootstrap(): void {
    if (process.env.NODE_ENV === "test") return;
    void this.bootstrapRun().catch((err: unknown) => this.logger.warn(`bootstrap patrol skipped: ${err instanceof Error ? err.message : String(err)}`));
  }

  isRunning(): boolean {
    return this.current !== null;
  }

  async runningRun(): Promise<RunRow | null> {
    return this.current ? this.current.started.catch(() => null) : null;
  }

  async run(trigger: PatrolTrigger, ctx: AccessContext | null): Promise<{ run: RunRow; alreadyRunning: boolean }> {
    if (this.current) return { run: await this.current.started, alreadyRunning: true };
    let markStarted!: (row: RunRow) => void;
    let failStart!: (err: unknown) => void;
    const started = new Promise<RunRow>((resolve, reject) => {
      markStarted = resolve;
      failStart = reject;
    });
    started.catch(() => undefined);
    const done = this.execute(trigger, ctx, markStarted).catch((err: unknown) => {
      failStart(err);
      throw err;
    });
    this.current = { started, done };
    try {
      return { run: await done, alreadyRunning: false };
    } finally {
      this.current = null;
    }
  }

  async autoTick(mode: "FULL" | "INTERVAL"): Promise<RunRow | null> {
    if (this.current) return null;
    const schedule = normalizeSchedule((await this.db.select().from(systemParams).where(eq(systemParams.key, "patrol.schedule")))[0]?.value ?? DEFAULT_PATROL_SCHEDULE);
    const last = (await this.db.select({ at: patrolRuns.startedAt }).from(patrolRuns).where(eq(patrolRuns.trigger, "AUTO")).orderBy(desc(patrolRuns.startedAt)).limit(1))[0];
    if (dueAutoRun(schedule, this.clock.now(), last?.at ?? null) !== mode) return null;
    return (await this.run("AUTO", null)).run;
  }

  private async bootstrapRun(): Promise<void> {
    const since = new Date(this.clock.now().getTime() - DAY_MS);
    const recent = await this.db.select({ id: patrolRuns.id }).from(patrolRuns).where(gte(patrolRuns.startedAt, since)).limit(1);
    if (recent.length) return;
    const { run } = await this.run("AUTO", null);
    this.logger.log(`bootstrap patrol ${run.docNo}: ${run.hitCount} hits in ${run.durationMs} ms`);
  }

  private async execute(trigger: PatrolTrigger, ctx: AccessContext | null, onStarted: (row: RunRow) => void): Promise<RunRow> {
    const t0 = performance.now();
    const now = this.clock.now();
    const docNo = await this.numbering.next("patrolRun");
    const run = (await this.db.insert(patrolRuns).values({ docNo, trigger, startedAt: now, status: "RUNNING", triggeredBy: ctx && !ctx.system ? ctx.userId : null }).returning())[0]!;
    onStarted(run);
    try {
      return await this.scan(run, trigger, ctx, now, t0);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.db.update(patrolRuns).set({ status: "FAILED", error: message, finishedAt: this.clock.now(), durationMs: Math.round(performance.now() - t0) }).where(eq(patrolRuns.id, run.id));
      throw err;
    }
  }

  private async scan(run: RunRow, trigger: PatrolTrigger, ctx: AccessContext | null, now: Date, t0: number): Promise<RunRow> {
    const rules = await this.db.select().from(patrolRules).where(eq(patrolRules.enabled, true)).orderBy(patrolRules.code);
    const gateCache = new Map<string, Promise<string[]>>();
    const g2Conditions = (customerId: string, versionId: string | null) => {
      const key = `${customerId}:${versionId ?? ""}`;
      if (!gateCache.has(key)) gateCache.set(key, this.flow.gateConditions(customerId, "G2", versionId));
      return gateCache.get(key)!;
    };
    const executed: { rule: RuleRow; params: RuleParams; candidates: PatrolCandidate[] }[] = [];
    for (const rule of rules) {
      const def = PATROL_RULE_TYPES.get(rule.ruleType);
      if (!def) continue;
      const params: RuleParams = { thresholdDays: Number(rule.params.thresholdDays ?? 0), yellowWindowDays: rule.yellowWindowDays, severity: rule.severity as PatrolSeverity };
      const scope: RuleScope = { customerIds: rule.customerIds?.length ? rule.customerIds : null, g2Conditions };
      executed.push({ rule, params, candidates: await def.findCandidates(this.db, params, now, scope) });
    }

    const members = await this.roleMembers();
    const docIds = [...new Set(executed.flatMap((e) => e.candidates.map((c) => c.docId)).filter((x): x is string => !!x))];
    const openTodos = docIds.length ? await this.db.select({ id: todos.id, docType: todos.docType, docId: todos.docId, source: todos.source, assigneeId: todos.assigneeId, fingerprint: todos.fingerprint }).from(todos).where(and(eq(todos.status, "OPEN"), inArray(todos.docId, docIds))) : [];
    const todoAssignees = (c: PatrolCandidate) => openTodos.filter((t) => t.docType === c.docType && t.docId === c.docId).map((t) => t.assigneeId);

    const found: Found[] = [];
    for (const { rule, params, candidates } of executed) {
      const def = PATROL_RULE_TYPES.get(rule.ruleType)!;
      for (const c of candidates) {
        c.assigneeId = resolveAssignee(rule.assigneeRole, c, members, todoAssignees(c));
        const judgement = def.judge(c, params, now);
        if (judgement) found.push({ rule, candidate: c, judgement, fingerprint: `${rule.id}:${c.targetId}` });
      }
    }

    return inTransaction(this.db, this.events, async (tx, emit) => {
      const fingerprints = found.map((f) => f.fingerprint);
      const known = fingerprints.length ? await tx.select().from(patrolHits).where(inArray(patrolHits.fingerprint, fingerprints)).orderBy(desc(patrolHits.firstSeenAt)) : [];
      const latest = new Map<string, HitRow>();
      for (const k of known) if (!latest.has(k.fingerprint)) latest.set(k.fingerprint, k);

      const counted: { found: Found; hit: HitRow }[] = [];
      const seen = new Set<string>();
      for (const f of found) {
        const prev = latest.get(f.fingerprint);
        if (prev && prev.status === "CLOSED" && prev.closeReason === "MANUAL" && prev.silencedUntil && prev.silencedUntil > now) continue;
        const values = {
          lastRunId: run.id,
          module: f.rule.module,
          targetType: f.rule.targetType,
          targetId: f.candidate.targetId,
          targetNo: f.candidate.targetNo,
          targetName: f.candidate.targetName,
          docType: f.candidate.docType,
          docId: f.candidate.docId,
          link: f.candidate.link,
          orderId: f.candidate.orderId,
          ownerId: f.candidate.ownerId,
          orgId: f.candidate.orgId,
          customerId: f.candidate.customerId,
          assigneeId: f.judgement.assigneeId,
          assigneeRole: f.rule.assigneeRole,
          light: f.judgement.light,
          severity: f.judgement.severity,
          message: f.judgement.message,
          overdueDays: f.judgement.overdueDays,
          lastSeenAt: now,
        };
        let hit: HitRow;
        if (prev && prev.status !== "CLOSED") {
          hit = (await tx.update(patrolHits).set({ ...values, version: prev.version + 1 }).where(eq(patrolHits.id, prev.id)).returning())[0]!;
          if (prev.light !== hit.light) emit({ type: "patrol.hit.updated", aggregateType: "patrolHit", aggregateId: hit.id, payload: { light: hit.light, from: prev.light } });
        } else if (prev && prev.closeReason === "MANUAL") {
          hit = (await tx.update(patrolHits).set({ ...values, status: "OPEN", closedAt: null, closeReason: null, silencedUntil: null, escalatedAt: null, version: prev.version + 1 }).where(eq(patrolHits.id, prev.id)).returning())[0]!;
          emit({ type: "patrol.hit.opened", aggregateType: "patrolHit", aggregateId: hit.id, payload: { light: hit.light, reopened: true } });
        } else {
          hit = (await tx.insert(patrolHits).values({ ...values, ruleId: f.rule.id, fingerprint: f.fingerprint, firstSeenAt: now, firstRunId: run.id, status: "OPEN" }).returning())[0]!;
          emit({ type: "patrol.hit.opened", aggregateType: "patrolHit", aggregateId: hit.id, payload: { light: hit.light } });
        }
        hit = await this.linkTodo(tx, f, hit, openTodos, now);
        counted.push({ found: f, hit });
        seen.add(f.fingerprint);
      }

      const stale = (await tx.select().from(patrolHits).where(ne(patrolHits.status, "CLOSED"))).filter((h) => !seen.has(h.fingerprint));
      for (const h of stale) {
        await tx.update(patrolHits).set({ status: "CLOSED", closeReason: "RESOLVED", closedAt: now, version: h.version + 1 }).where(eq(patrolHits.id, h.id));
        if (h.todoOwned) await this.todos.close(patrolTodoKey(h.fingerprint), tx);
        emit({ type: "patrol.hit.closed", aggregateType: "patrolHit", aggregateId: h.id, payload: { reason: "RESOLVED", light: h.light } });
      }

      await this.notifySummary(tx, run.docNo, counted.map((c) => c.hit));
      await this.escalate(tx, now);

      const scanned = [...new Set(executed.map((e) => e.rule.module))];
      const hitModules = new Set(counted.map((c) => c.found.rule.module));
      const ruleStats: Record<string, { hits: number; red: number; yellow: number }> = {};
      for (const e of executed) ruleStats[e.rule.code] = { hits: 0, red: 0, yellow: 0 };
      for (const { found: f } of counted) {
        const s = ruleStats[f.rule.code]!;
        s.hits += 1;
        if (f.judgement.light === "RED") s.red += 1;
        else s.yellow += 1;
      }
      const red = counted.filter((c) => c.found.judgement.light === "RED").length;
      const finished = (
        await tx
          .update(patrolRuns)
          .set({
            status: "DONE",
            finishedAt: this.clock.now(),
            durationMs: Math.max(1, Math.round(performance.now() - t0)),
            ruleCount: executed.length,
            hitCount: counted.length,
            redCount: red,
            yellowCount: counted.length - red,
            scannedModules: scanned,
            greenModules: scanned.filter((m) => !hitModules.has(m)),
            ruleStats,
          })
          .where(eq(patrolRuns.id, run.id))
          .returning()
      )[0]!;
      await this.audit.log(ctx, { action: trigger === "MANUAL" ? "patrol.run.manual" : "patrol.run.auto", objectType: "patrolRun", objectId: run.id, docNo: run.docNo, diff: { hitCount: finished.hitCount, redCount: finished.redCount, yellowCount: finished.yellowCount, closed: stale.length } }, tx);
      return finished;
    });
  }

  private async linkTodo(tx: DbOrTx, f: Found, hit: HitRow, openTodos: { id: string; docType: string | null; docId: string | null; source: string; assigneeId: string }[], now: Date): Promise<HitRow> {
    const moduleTodos = f.candidate.docId ? openTodos.filter((t) => t.source !== "PATROL" && t.docType === f.candidate.docType && t.docId === f.candidate.docId) : [];
    let todoId: string | null = null;
    let owned = false;
    if (!hit.todoOwned && moduleTodos.length) {
      todoId = (moduleTodos.find((t) => t.assigneeId === hit.assigneeId) ?? moduleTodos[0]!).id;
    } else if (hit.assigneeId) {
      const key = patrolTodoKey(hit.fingerprint);
      const dueAt = f.judgement.light === "RED" ? now : new Date(now.getTime() + Math.max(0, -f.judgement.overdueDays) * DAY_MS);
      await this.todos.upsert(
        {
          fingerprint: key,
          source: "PATROL",
          action: "patrol.hit",
          title: `${f.rule.name}${hit.targetNo ? ` ${hit.targetNo}` : ""}`,
          description: f.judgement.message.zh,
          docType: hit.docType,
          docId: hit.docId,
          docNo: hit.targetNo,
          link: hit.link,
          customerId: hit.customerId,
          assigneeId: hit.assigneeId,
          dueAt,
        },
        tx,
      );
      todoId = (await tx.select({ id: todos.id }).from(todos).where(eq(todos.fingerprint, key)))[0]?.id ?? null;
      owned = true;
    }
    if (hit.todoId === todoId && hit.todoOwned === owned) return hit;
    return (await tx.update(patrolHits).set({ todoId, todoOwned: owned }).where(eq(patrolHits.id, hit.id)).returning())[0]!;
  }

  private async notifySummary(tx: DbOrTx, docNo: string, hits: HitRow[]): Promise<void> {
    const byUser = new Map<string, HitRow[]>();
    for (const h of hits) if (h.assigneeId) byUser.set(h.assigneeId, [...(byUser.get(h.assigneeId) ?? []), h]);
    if (!byUser.size) return;
    const viewers = new Set(
      (
        await tx
          .select({ userId: userRoles.userId })
          .from(userRoles)
          .innerJoin(rolePermissions, eq(rolePermissions.roleId, userRoles.roleId))
          .where(and(inArray(userRoles.userId, [...byUser.keys()]), eq(rolePermissions.permission, "patrol.dashboard.view")))
      ).map((r) => r.userId),
    );
    for (const [userId, list] of byUser) {
      const red = list.filter((h) => h.light === "RED").length;
      await this.notifications.notify([userId], { type: "patrol.summary", title: `巡检命中 ${list.length} 条`, body: `${docNo} · 红灯 ${red} 条 · 黄灯 ${list.length - red} 条`, link: viewers.has(userId) ? "/patrol" : "/todo" }, tx);
    }
  }

  private async escalate(tx: DbOrTx, now: Date): Promise<void> {
    const cutoff = new Date(now.getTime() - ESCALATE_AFTER_DAYS * DAY_MS);
    const due = (await tx.select().from(patrolHits).where(and(eq(patrolHits.status, "OPEN"), eq(patrolHits.light, "RED")))).filter((h) => !h.escalatedAt && h.firstSeenAt <= cutoff);
    if (!due.length) return;
    const orgRows = await tx.select({ id: orgs.id, parentId: orgs.parentId, leaderId: orgs.leaderId }).from(orgs);
    const orgById = new Map(orgRows.map((o) => [o.id, o]));
    const people = compactIds(due.map((h) => h.assigneeId ?? h.ownerId));
    const primary = new Map(people.length ? (await tx.select({ id: users.id, orgId: users.primaryOrgId }).from(users).where(inArray(users.id, people))).map((u) => [u.id, u.orgId]) : []);
    const ruleNames = new Map((await tx.select({ id: patrolRules.id, name: patrolRules.name }).from(patrolRules)).map((r) => [r.id, r.name]));
    for (const h of due) {
      const person = h.assigneeId ?? h.ownerId;
      if (!person) continue;
      let org = orgById.get(primary.get(person) ?? "");
      let leader: string | null = null;
      while (org) {
        if (org.leaderId && org.leaderId !== person) {
          leader = org.leaderId;
          break;
        }
        org = org.parentId ? orgById.get(org.parentId) : undefined;
      }
      if (!leader) continue;
      const days = Math.floor((now.getTime() - h.firstSeenAt.getTime()) / DAY_MS);
      await this.notifications.notify([leader], { type: "patrol.escalation", title: `红灯巡检 ${days} 天未处理：${ruleNames.get(h.ruleId) ?? ""}${h.targetNo ? ` ${h.targetNo}` : ""}`, body: h.message.zh, link: "/patrol" }, tx);
      await tx.update(patrolHits).set({ escalatedAt: now }).where(eq(patrolHits.id, h.id));
    }
  }

  private async roleMembers(): Promise<Map<string, Member[]>> {
    const rows = await this.db
      .select({ id: users.id, orgId: users.primaryOrgId, role: roles.code })
      .from(userRoles)
      .innerJoin(users, eq(users.id, userRoles.userId))
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .where(and(eq(users.status, "ACTIVE"), eq(roles.status, "ACTIVE")))
      .orderBy(users.phone);
    const out = new Map<string, Member[]>();
    for (const r of rows) out.set(r.role, [...(out.get(r.role) ?? []), { id: r.id, orgId: r.orgId }]);
    return out;
  }
}

export function resolveAssignee(role: string, c: PatrolCandidate, members: Map<string, Member[]>, todoAssignees: string[]): string | null {
  const list = members.get(role) ?? [];
  const isMember = (id: string | null | undefined): id is string => !!id && list.some((m) => m.id === id);
  if (role === "R001") return isMember(c.ownerId) ? c.ownerId : (list[0]?.id ?? c.ownerId ?? null);
  for (const id of [...c.responsibleIds, c.ownerId, ...todoAssignees]) if (isMember(id)) return id;
  return list[0]?.id ?? null;
}

function compactIds(ids: (string | null | undefined)[]): string[] {
  return [...new Set(ids.filter((x): x is string => !!x))];
}

