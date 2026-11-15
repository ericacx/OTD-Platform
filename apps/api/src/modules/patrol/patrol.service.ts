import { Inject, Injectable } from "@nestjs/common";
import type { Page } from "@otd/contracts/common";
import {
  type PatrolDashboardDto,
  type PatrolHitDto,
  type PatrolHitHandleInput,
  type PatrolHitQuery,
  type PatrolRuleDto,
  type PatrolRuleUpdateInput,
  type PatrolRunDto,
  type PatrolRunQuery,
  type PatrolRunResultDto,
  patrolErrors,
} from "@otd/contracts/patrol";
import { type Database, customers, patrolHits, patrolRules, patrolRuns, users } from "@otd/db";
import { MODULES, PRESET_ROLES, canTransition } from "@otd/shared";
import { type SQL, and, asc, desc, eq, ilike, inArray, ne, or, sql } from "drizzle-orm";
import type { AccessContext } from "../../core/access/access.types.js";
import { AuditService, diffOf } from "../../core/audit.service.js";
import { Clock } from "../../core/clock.js";
import { AppError, assertFound, illegalTransition, notFound, versionConflict } from "../../core/errors.js";
import { EventBus, inTransaction } from "../../core/events.js";
import { countAll, iso, likeKeyword, paginate } from "../../core/paging.js";
import { DB } from "../../core/tokens.js";
import { TodoService } from "../todo/todo.service.js";
import { PatrolRunner, SILENCE_DAYS, patrolTodoKey } from "./patrol-runner.service.js";
import { canSeeHit, visibleHits } from "./patrol.scope.js";
import { PATROL_RULE_TYPES, RULE_PARAM_KEYS } from "./rules/index.js";
import { DAY_MS, type RuleParams } from "./rules/types.js";

type HitRow = typeof patrolHits.$inferSelect;
type RuleRow = typeof patrolRules.$inferSelect;
type RunRow = typeof patrolRuns.$inferSelect;

const OPEN_STATUSES = ["OPEN", "HANDLING"];
const moduleLabel = (code: string) => MODULES.find((m) => m.code === code)?.label ?? { zh: code, en: code };
const roleLabel = (code: string | null) => (code ? (PRESET_ROLES.find((r) => r.code === code)?.label ?? null) : null);

@Injectable()
export class PatrolService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly clock: Clock,
    private readonly audit: AuditService,
    private readonly events: EventBus,
    private readonly todos: TodoService,
    private readonly runner: PatrolRunner,
  ) {}

  async runNow(ctx: AccessContext): Promise<PatrolRunResultDto> {
    const { run, alreadyRunning } = await this.runner.run("MANUAL", ctx);
    return { ...(await this.toRuns([run]))[0]!, alreadyRunning };
  }

  async dashboard(ctx: AccessContext, q: PatrolHitQuery): Promise<PatrolDashboardDto> {
    const visible = visibleHits(ctx);
    const open = await this.db
      .select({ light: patrolHits.light, module: patrolHits.module, n: countAll })
      .from(patrolHits)
      .where(and(visible, inArray(patrolHits.status, OPEN_STATUSES)))
      .groupBy(patrolHits.light, patrolHits.module);
    const rules = await this.db.select({ module: patrolRules.module, enabled: patrolRules.enabled }).from(patrolRules);
    const runs = await this.db.select().from(patrolRuns).where(eq(patrolRuns.status, "DONE")).orderBy(desc(patrolRuns.startedAt)).limit(2);
    const running = await this.runner.runningRun();
    const [lastRun, previousRun, runningDto] = await this.toRuns([runs[0], runs[1], running ?? undefined]);
    const enabled = rules.filter((r) => r.enabled);
    const moduleCodes = [...new Set(rules.map((r) => r.module))].sort();
    return {
      legend: {
        red: open.filter((o) => o.light === "RED").reduce((s, o) => s + o.n, 0),
        yellow: open.filter((o) => o.light === "YELLOW").reduce((s, o) => s + o.n, 0),
        greenModules: runs[0]?.greenModules.length ?? 0,
        scannedModules: runs[0]?.scannedModules.length ?? 0,
        greenModuleCodes: runs[0]?.greenModules ?? [],
      },
      kpis: {
        activeRules: enabled.length,
        totalRules: rules.length,
        coveredModules: new Set(enabled.map((r) => r.module)).size,
        hitCount: runs[0]?.hitCount ?? 0,
        lastRunAt: iso(runs[0]?.startedAt),
      },
      lastRun: lastRun ?? null,
      previousRun: previousRun ?? null,
      running: runningDto ?? null,
      modules: moduleCodes.map((code) => ({ code, label: moduleLabel(code), open: open.filter((o) => o.module === code).reduce((s, o) => s + o.n, 0) })),
      hits: await this.hits(ctx, q),
    };
  }

  async hits(ctx: AccessContext, q: PatrolHitQuery): Promise<Page<PatrolHitDto>> {
    const conds: SQL[] = [visibleHits(ctx), inArray(patrolHits.status, q.status?.length ? q.status : OPEN_STATUSES)];
    if (q.module?.length) conds.push(inArray(patrolHits.module, q.module));
    if (q.light?.length) conds.push(inArray(patrolHits.light, q.light));
    if (q.severity?.length) conds.push(inArray(patrolHits.severity, q.severity));
    if (q.ruleId) conds.push(eq(patrolHits.ruleId, q.ruleId));
    const kw = likeKeyword(q.keyword);
    if (kw) conds.push(or(ilike(patrolHits.targetNo, kw), ilike(patrolHits.targetName, kw))!);
    const where = and(...conds);
    return paginate(
      q,
      async () => (await this.db.select({ n: countAll }).from(patrolHits).where(where))[0]!.n,
      async (limit, offset) =>
        this.toHits(
          await this.db
            .select()
            .from(patrolHits)
            .where(where)
            .orderBy(
              sql`case ${patrolHits.status} when 'CLOSED' then 1 else 0 end`,
              sql`case ${patrolHits.light} when 'RED' then 0 else 1 end`,
              sql`case ${patrolHits.severity} when 'HIGH' then 0 when 'MEDIUM' then 1 else 2 end`,
              desc(patrolHits.overdueDays),
              asc(patrolHits.firstSeenAt),
            )
            .limit(limit)
            .offset(offset),
        ),
    );
  }

  async hit(ctx: AccessContext, id: string): Promise<PatrolHitDto> {
    const row = (await this.db.select().from(patrolHits).where(eq(patrolHits.id, id)))[0];
    if (!row || !canSeeHit(ctx, row)) throw notFound();
    return (await this.toHits([row]))[0]!;
  }

  async docHits(ctx: AccessContext, docType: string, docId: string): Promise<PatrolHitDto[]> {
    const rows = await this.db
      .select()
      .from(patrolHits)
      .where(and(visibleHits(ctx), inArray(patrolHits.status, OPEN_STATUSES), or(and(eq(patrolHits.docType, docType), eq(patrolHits.docId, docId)), and(eq(patrolHits.targetType, docType), eq(patrolHits.targetId, docId)))))
      .orderBy(sql`case ${patrolHits.light} when 'RED' then 0 else 1 end`, desc(patrolHits.overdueDays));
    return this.toHits(rows);
  }

  async handle(ctx: AccessContext, id: string, input: PatrolHitHandleInput): Promise<PatrolHitDto> {
    const before = (await this.db.select().from(patrolHits).where(eq(patrolHits.id, id)))[0];
    if (!before || !canSeeHit(ctx, before)) throw notFound();
    const to = input.action === "START" ? "HANDLING" : "CLOSED";
    if (!canTransition("patrolHit", before.status as "OPEN" | "HANDLING" | "CLOSED", to)) throw illegalTransition(before.status, input.action === "START" ? "start" : "close");
    const note = input.note?.trim() || null;
    if (to === "CLOSED" && !note) throw new AppError(patrolErrors.PATROL_NOTE_REQUIRED);
    const now = this.clock.now();
    const updated = await inTransaction(this.db, this.events, async (tx, emit) => {
      const patch: Partial<HitRow> =
        to === "HANDLING"
          ? { status: "HANDLING", handledBy: ctx.userId, handledAt: now, ...(note ? { handleNote: note } : {}) }
          : { status: "CLOSED", closeReason: "MANUAL", closedAt: now, handleNote: note, handledBy: ctx.userId, handledAt: now, silencedUntil: new Date(now.getTime() + SILENCE_DAYS * DAY_MS) };
      const row = (await tx.update(patrolHits).set({ ...patch, version: before.version + 1 }).where(and(eq(patrolHits.id, id), eq(patrolHits.version, input.version))).returning())[0];
      if (!row) throw versionConflict();
      if (to === "CLOSED" && before.todoOwned) await this.todos.close(patrolTodoKey(before.fingerprint), tx);
      await this.audit.log(ctx, { action: to === "HANDLING" ? "patrol.hit.start" : "patrol.hit.close", objectType: "patrolHit", objectId: id, docNo: before.targetNo, diff: { status: { from: before.status, to }, ...(note ? { note } : {}) } }, tx);
      if (to === "CLOSED") emit({ type: "patrol.hit.closed", aggregateType: "patrolHit", aggregateId: id, payload: { reason: "MANUAL", light: before.light } });
      return row;
    });
    return (await this.toHits([updated]))[0]!;
  }

  async rules(): Promise<PatrolRuleDto[]> {
    const rows = await this.db.select().from(patrolRules).orderBy(asc(patrolRules.code));
    return this.toRules(rows);
  }

  async updateRule(ctx: AccessContext, id: string, input: PatrolRuleUpdateInput): Promise<PatrolRuleDto> {
    const before = assertFound((await this.db.select().from(patrolRules).where(eq(patrolRules.id, id)))[0]);
    if (!PATROL_RULE_TYPES.has(before.ruleType)) throw new AppError(patrolErrors.PATROL_RULE_TYPE_UNKNOWN, { ruleType: before.ruleType });
    for (const key of Object.keys(input.params ?? {})) if (!(RULE_PARAM_KEYS as readonly string[]).includes(key)) throw new AppError(patrolErrors.PATROL_PARAM_INVALID, { key });
    if (input.customerIds?.length) {
      const found = await this.db.select({ id: customers.id }).from(customers).where(inArray(customers.id, input.customerIds));
      if (found.length !== new Set(input.customerIds).size) throw new AppError(patrolErrors.PATROL_PARAM_INVALID, { key: "customerIds" });
    }
    if (before.version !== input.version) throw versionConflict();
    const patch: Partial<RuleRow> = {};
    if (input.params) patch.params = { ...before.params, ...input.params };
    if (input.severity) patch.severity = input.severity;
    if (input.yellowWindowDays !== undefined) patch.yellowWindowDays = input.yellowWindowDays;
    if (input.enabled !== undefined) patch.enabled = input.enabled;
    if (input.customerIds !== undefined) patch.customerIds = input.customerIds?.length ? [...new Set(input.customerIds)] : null;
    const diff = diffOf(before as unknown as Record<string, unknown>, patch as Record<string, unknown>);
    const updated = await inTransaction(this.db, this.events, async (tx) => {
      await this.audit.snapshot(ctx, "patrolRule", id, before.version, { params: before.params, severity: before.severity, yellowWindowDays: before.yellowWindowDays, enabled: before.enabled, customerIds: before.customerIds }, input.reason, tx);
      const row = (await tx.update(patrolRules).set({ ...patch, version: before.version + 1, updatedBy: ctx.userId, updatedAt: this.clock.now() }).where(and(eq(patrolRules.id, id), eq(patrolRules.version, input.version))).returning())[0];
      if (!row) throw versionConflict();
      await this.audit.log(ctx, { action: "patrol.rule.update", objectType: "patrolRule", objectId: id, docNo: before.code, diff: { ...diff, ...(input.reason ? { reason: input.reason } : {}) } }, tx);
      return row;
    });
    return (await this.toRules([updated]))[0]!;
  }

  async runs(q: PatrolRunQuery): Promise<Page<PatrolRunDto>> {
    const where = q.trigger ? eq(patrolRuns.trigger, q.trigger) : undefined;
    return paginate(
      q,
      async () => (await this.db.select({ n: countAll }).from(patrolRuns).where(where))[0]!.n,
      async (limit, offset) => (await this.toRuns(await this.db.select().from(patrolRuns).where(where).orderBy(desc(patrolRuns.startedAt)).limit(limit).offset(offset))) as PatrolRunDto[],
    );
  }

  async run(id: string): Promise<PatrolRunDto> {
    const row = assertFound((await this.db.select().from(patrolRuns).where(eq(patrolRuns.id, id)))[0]);
    return (await this.toRuns([row]))[0]!;
  }

  private async toRuns(rows: (RunRow | undefined)[]): Promise<(PatrolRunDto | undefined)[]> {
    const ids = [...new Set(rows.map((r) => r?.triggeredBy).filter((x): x is string => !!x))];
    const names = ids.length ? new Map((await this.db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, ids))).map((u) => [u.id, u.name])) : new Map<string, string>();
    return rows.map((r) =>
      r
        ? {
            id: r.id,
            docNo: r.docNo,
            trigger: r.trigger as PatrolRunDto["trigger"],
            status: r.status as PatrolRunDto["status"],
            startedAt: r.startedAt.toISOString(),
            finishedAt: iso(r.finishedAt),
            durationMs: r.durationMs,
            ruleCount: r.ruleCount,
            hitCount: r.hitCount,
            redCount: r.redCount,
            yellowCount: r.yellowCount,
            scannedModules: r.scannedModules,
            greenModules: r.greenModules,
            ruleStats: r.ruleStats,
            triggeredBy: r.triggeredBy,
            triggeredByName: r.triggeredBy ? (names.get(r.triggeredBy) ?? null) : null,
            error: r.error,
          }
        : undefined,
    );
  }

  private async toRules(rows: RuleRow[]): Promise<PatrolRuleDto[]> {
    const custIds = [...new Set(rows.flatMap((r) => r.customerIds ?? []))];
    const names = custIds.length ? new Map((await this.db.select({ id: customers.id, name: customers.name }).from(customers).where(inArray(customers.id, custIds))).map((c) => [c.id, c.name])) : new Map<string, string>();
    const open = rows.length
      ? new Map(
          (
            await this.db
              .select({ ruleId: patrolHits.ruleId, n: countAll })
              .from(patrolHits)
              .where(and(inArray(patrolHits.ruleId, rows.map((r) => r.id)), ne(patrolHits.status, "CLOSED")))
              .groupBy(patrolHits.ruleId)
          ).map((r) => [r.ruleId, r.n]),
        )
      : new Map<string, number>();
    return rows.map((r) => {
      const def = PATROL_RULE_TYPES.get(r.ruleType);
      const params = Object.fromEntries(Object.entries(r.params).filter(([, v]) => typeof v === "number")) as Record<string, number>;
      const ruleParams: RuleParams = { thresholdDays: params.thresholdDays ?? 0, yellowWindowDays: r.yellowWindowDays, severity: r.severity as RuleParams["severity"] };
      return {
        id: r.id,
        code: r.code,
        module: r.module,
        moduleLabel: moduleLabel(r.module),
        ruleType: r.ruleType,
        kind: def?.kind ?? null,
        name: r.name,
        nameEn: r.nameEn,
        targetType: r.targetType,
        params,
        paramKeys: [...RULE_PARAM_KEYS],
        condition: def ? def.condition(ruleParams) : { zh: r.ruleType, en: r.ruleType },
        severity: r.severity as PatrolRuleDto["severity"],
        assigneeRole: r.assigneeRole,
        assigneeRoleLabel: roleLabel(r.assigneeRole),
        yellowWindowDays: r.yellowWindowDays,
        enabled: r.enabled,
        customerIds: r.customerIds,
        customerNames: (r.customerIds ?? []).map((id) => names.get(id) ?? id),
        description: r.description,
        openHits: open.get(r.id) ?? 0,
        updatedAt: r.updatedAt.toISOString(),
        version: r.version,
      };
    });
  }

  private async toHits(rows: HitRow[]): Promise<PatrolHitDto[]> {
    if (!rows.length) return [];
    const ruleRows = await this.db.select().from(patrolRules).where(inArray(patrolRules.id, [...new Set(rows.map((r) => r.ruleId))]));
    const rules = new Map(ruleRows.map((r) => [r.id, r]));
    const userIds = [...new Set(rows.flatMap((r) => [r.assigneeId, r.handledBy]).filter((x): x is string => !!x))];
    const names = userIds.length ? new Map((await this.db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, userIds))).map((u) => [u.id, u.name])) : new Map<string, string>();
    const custIds = [...new Set(rows.map((r) => r.customerId).filter((x): x is string => !!x))];
    const custNames = custIds.length ? new Map((await this.db.select({ id: customers.id, name: customers.name }).from(customers).where(inArray(customers.id, custIds))).map((c) => [c.id, c.name])) : new Map<string, string>();
    return rows.map((r) => {
      const rule = rules.get(r.ruleId);
      return {
        id: r.id,
        ruleId: r.ruleId,
        ruleCode: rule?.code ?? "",
        ruleName: { zh: rule?.name ?? "", en: rule?.nameEn ?? rule?.name ?? "" },
        ruleType: rule?.ruleType ?? "",
        module: r.module,
        moduleLabel: moduleLabel(r.module),
        targetType: r.targetType,
        targetId: r.targetId,
        targetNo: r.targetNo,
        targetName: r.targetName,
        docType: r.docType,
        docId: r.docId,
        link: r.link,
        light: r.light as PatrolHitDto["light"],
        severity: r.severity as PatrolHitDto["severity"],
        message: r.message,
        overdueDays: r.overdueDays,
        assigneeId: r.assigneeId,
        assigneeName: r.assigneeId ? (names.get(r.assigneeId) ?? null) : null,
        assigneeRole: r.assigneeRole ?? rule?.assigneeRole ?? null,
        assigneeRoleLabel: roleLabel(r.assigneeRole ?? rule?.assigneeRole ?? null),
        customerId: r.customerId,
        customerName: r.customerId ? (custNames.get(r.customerId) ?? null) : null,
        status: r.status as PatrolHitDto["status"],
        closeReason: (r.closeReason as PatrolHitDto["closeReason"]) ?? null,
        handleNote: r.handleNote,
        handledByName: r.handledBy ? (names.get(r.handledBy) ?? null) : null,
        handledAt: iso(r.handledAt),
        todoId: r.todoId,
        todoOwned: r.todoOwned,
        firstSeenAt: r.firstSeenAt.toISOString(),
        lastSeenAt: r.lastSeenAt.toISOString(),
        closedAt: iso(r.closedAt),
        escalatedAt: iso(r.escalatedAt),
        version: r.version,
      };
    });
  }
}
